// Runs the whole money flow against pretend Paystack and Prodigi servers.
// `npm test` — nothing leaves your computer.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

process.env.PRODIGI_ENV = "sandbox";
process.env.PRODIGI_API_KEY = "test-prodigi";
process.env.PAYSTACK_SECRET_KEY = "sk_test_x";
process.env.FX_RATE = "24";
process.env.SHIPPING_MARKUP = "0.15";
process.env.SITE_URL = "https://shop.test";

const state = { paystack: new Map(), prodigiOrders: new Map(), quoteFails: false, calls: [], emails: [], emailFails: false };

global.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  const body = opts.body ? JSON.parse(opts.body) : null;
  const json = (status, data) => ({ ok: status < 400, status, text: async () => JSON.stringify(data), json: async () => data });
  state.calls.push(`${opts.method || "GET"} ${u.host}${u.pathname}`);
  if (u.host === "api.paystack.co") {
    if (u.pathname === "/transaction/initialize") {
      state.paystack.set(body.reference, { ...body, status: "abandoned" });
      return json(200, { status: true, data: { authorization_url: "https://checkout.paystack.com/abc", reference: body.reference } });
    }
    const ref = decodeURIComponent(u.pathname.split("/").pop());
    const t = state.paystack.get(ref);
    return json(200, { status: true, data: { status: t.status, reference: ref, amount: t.amount, currency: t.currency, metadata: t.metadata } });
  }
  if (u.host === "api.sandbox.prodigi.com") {
    if (u.pathname === "/v4.0/quotes") {
      if (state.quoteFails) return json(400, { outcome: "ValidationFailed" });
      return json(200, { outcome: "Created", quotes: [{ shipmentMethod: "Standard", costSummary: { items: { amount: "30.00", currency: "GBP" }, shipping: { amount: "12.00", currency: "GBP" } }, shipments: [{ fulfillmentLocation: { countryCode: "GB" } }] }] });
    }
    if (u.pathname === "/v4.0/orders" && opts.method === "POST") {
      const existing = state.prodigiOrders.get(body.idempotencyKey);
      if (existing) return json(200, { outcome: "AlreadyExists", order: existing });
      const order = { id: "ord_" + state.prodigiOrders.size, ...body };
      state.prodigiOrders.set(body.idempotencyKey, order);
      return json(200, { outcome: "Created", order });
    }
    if (u.pathname === "/v4.0/orders") return json(200, { orders: [{ status: { stage: "InProgress" }, shipments: [] }] });
  }
  if (u.host === "api.emailjs.com") {
    if (state.emailFails) return { ok: false, status: 500, text: async () => "down" };
    state.emails.push(body);
    return { ok: true, status: 200, text: async () => "OK" };
  }
  throw new Error("unexpected fetch " + url);
};

const call = async (mod, { method = "POST", body, query } = {}) => {
  const out = {};
  const res = { setHeader() {}, end(t) { out.body = JSON.parse(t); }, set statusCode(v) { out.status = v; } };
  await require(`../api/${mod}.js`)({ method, body, query, headers: { host: "shop.test" }, url: "/api/" + mod }, res);
  return out;
};

const recipient = { name: "Jo Buyer", email: "jo@example.com", line1: "1 Long St", city: "Cape Town", postcode: "8001", country: "ZA", phone: "082 555 0123" };
const pay = (ref, mutate) => { const t = state.paystack.get(ref); t.status = "success"; if (mutate) mutate(t); };

test("catalog lists paintings and hides ones that can't be printed", async () => {
  const { body } = await call("catalog", { method: "GET" });
  assert.ok(body.items["burnt-horizon"].sizes.length > 0);
  assert.equal(body.items["the-lookout"], undefined, "panorama has no suitable canvas shape");
  assert.equal(body.items["window-bone-and-blue"], undefined, "Picasso study held back");
});

test("quote adds marked-up shipping in rand", async () => {
  const { status, body } = await call("quote", { body: { slug: "burnt-horizon", size: "12x12", country: "ZA" } });
  assert.equal(status, 200);
  assert.equal(body.item, 1830);
  assert.equal(body.shipping, Math.ceil((12 * 24 * 1.15) / 10) * 10); // 340
  assert.equal(body.total, body.item + body.shipping);
});

test("quote refuses wrong size, unknown painting, unsupported country", async () => {
  assert.equal((await call("quote", { body: { slug: "burnt-horizon", size: "24x36", country: "ZA" } })).status, 400);
  assert.equal((await call("quote", { body: { slug: "nope", size: "12x12", country: "ZA" } })).status, 404);
  assert.equal((await call("quote", { body: { slug: "burnt-horizon", size: "12x12", country: "KP" } })).status, 400);
});

test("full flow: checkout -> paid -> webhook prints once, even if repeated", async () => {
  const c = await call("checkout", { body: { slug: "brothers", size: "12x18", recipient, amount: 1 } });
  assert.equal(c.status, 200);
  const ref = c.body.reference;
  const tx = state.paystack.get(ref);
  assert.equal(tx.currency, "ZAR");
  assert.equal(tx.amount, (2120 + 340) * 100, "amount comes from the server, ignoring the browser");

  let w = await call("webhook", { body: { event: "charge.success", data: { reference: ref } } });
  assert.equal(w.body.state, "unpaid");
  assert.equal(state.prodigiOrders.size, 0);

  pay(ref);
  w = await call("webhook", { body: { event: "charge.success", data: { reference: ref } } });
  assert.equal(w.body.state, "placed");
  const o = state.prodigiOrders.get(ref);
  assert.equal(o.items[0].sku, "GLOBAL-CAN-12X18", "landscape painting uses the single (portrait-named) SKU");
  assert.equal(o.items[0].assets[0].url, "https://shop.test/images/brothers.jpg");
  assert.equal(o.recipient.address.countryCode, "ZA");

  await call("webhook", { body: { event: "charge.success", data: { reference: ref } } });
  const o2 = await call("order", { method: "GET", query: { ref } });
  assert.equal(o2.body.state, "placed");
  assert.equal(state.prodigiOrders.size, 1, "never printed twice");
});

test("a payment that doesn't match the expected amount is flagged, not printed", async () => {
  const c = await call("checkout", { body: { slug: "meadow-in-bloom", size: "16x16", recipient } });
  pay(c.body.reference, (t) => { t.amount = 100; });
  const before = state.prodigiOrders.size;
  const w = await call("webhook", { body: { event: "charge.success", data: { reference: c.body.reference } } });
  assert.equal(w.body.state, "flagged");
  assert.equal(state.prodigiOrders.size, before);
});

test("webhook ignores other events and foreign references", async () => {
  assert.equal((await call("webhook", { body: { event: "transfer.success", data: {} } })).body.ignored, "transfer.success");
  assert.equal((await call("webhook", { body: { event: "charge.success", data: { reference: "someone-elses" } } })).body.ignored, "not-our-reference");
});

test("checkout validates delivery details", async () => {
  assert.equal((await call("checkout", { body: { slug: "brothers", size: "12x18", recipient: { ...recipient, email: "nope" } } })).status, 400);
  assert.equal((await call("checkout", { body: { slug: "brothers", size: "12x18", recipient: { ...recipient, line1: "" } } })).status, 400);
});

test("live mode never prints from the low-res web image", async () => {
  process.env.PRODIGI_ENV = "live";
  const { body } = await call("catalog", { method: "GET" });
  assert.deepEqual(Object.keys(body.items), []);
  process.env.PRODIGI_ENV = "sandbox";
});

test("delivery details need a usable phone number", async () => {
  const bad = await call("checkout", { body: { slug: "brothers", size: "12x18", recipient: { ...recipient, phone: "" } } });
  assert.equal(bad.status, 400);
  const bad2 = await call("checkout", { body: { slug: "brothers", size: "12x18", recipient: { ...recipient, phone: "abc" } } });
  assert.equal(bad2.status, 400);
});

test("order emails: buyer confirmation and owner note go out once; a mail failure never blocks the order", async () => {
  Object.assign(process.env, { EMAILJS_SERVICE_ID: "svc", EMAILJS_PUBLIC_KEY: "pub", EMAILJS_PRIVATE_KEY: "priv", EMAILJS_ORDER_TEMPLATE: "tpl_order", EMAILJS_NOTIFY_TEMPLATE: "tpl_notify" });
  try {
    state.emails.length = 0;
    const c = await call("checkout", { body: { slug: "brothers", size: "12x18", recipient } });
    pay(c.body.reference);
    let w = await call("webhook", { body: { event: "charge.success", data: { reference: c.body.reference } } });
    assert.equal(w.body.state, "placed");
    assert.equal(state.emails.length, 2);
    const buyer = state.emails.find((e) => e.template_id === "tpl_order"), owner = state.emails.find((e) => e.template_id === "tpl_notify");
    assert.equal(buyer.template_params.to_email, "jo@example.com");
    assert.equal(buyer.template_params.order_ref, c.body.reference);
    assert.equal(buyer.template_params.painting, "Brothers");
    assert.match(buyer.template_params.size, /^18 x 12 in/, "landscape painting is described wide");
    assert.equal(buyer.template_params.total, "R 2 460");
    assert.equal(buyer.accessToken, "priv");
    assert.match(owner.template_params.message, /New print order/);
    await call("webhook", { body: { event: "charge.success", data: { reference: c.body.reference } } });
    await call("order", { method: "GET", query: { ref: c.body.reference } });
    assert.equal(state.emails.length, 2, "repeat calls do not email again");

    state.emailFails = true;
    const c2 = await call("checkout", { body: { slug: "brothers", size: "12x18", recipient } });
    pay(c2.body.reference);
    w = await call("webhook", { body: { event: "charge.success", data: { reference: c2.body.reference } } });
    assert.equal(w.body.state, "placed", "order still goes to print when email is down");
  } finally {
    state.emailFails = false;
    for (const k of ["EMAILJS_SERVICE_ID", "EMAILJS_PUBLIC_KEY", "EMAILJS_PRIVATE_KEY", "EMAILJS_ORDER_TEMPLATE", "EMAILJS_NOTIFY_TEMPLATE"]) delete process.env[k];
  }
});
