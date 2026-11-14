// Runs the whole money flow against pretend Paystack, Gelato and EmailJS servers.
// `npm test` — nothing leaves your computer.
const test = require("node:test");
const assert = require("node:assert/strict");

process.env.GELATO_MODE = "draft";
process.env.GELATO_API_KEY = "test-gelato";
process.env.PAYSTACK_SECRET_KEY = "sk_test_x";
process.env.FX_RATE = "19";
process.env.SHIPPING_MARKUP = "0.15";
process.env.SITE_URL = "https://shop.test";
require("./fake-gelato");

const state = { paystack: new Map(), gelato: new Map(), quoteFails: false, noExpress: false, rejectUid: false, calls: [], emails: [], emailFails: false };

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
    return json(200, { status: true, data: { status: t.status, reference: ref, amount: t.amount, currency: t.currency, metadata: t.metadata, paid_at: t.paid_at } });
  }
  if (u.host === "order.gelatoapis.com") {
    assert.equal(opts.headers["X-API-KEY"], "test-gelato");
    if (u.pathname === "/v4/orders:quote") {
      if (state.quoteFails) return json(400, { message: "Address not supported" });
      const methods = [
        { name: "Courier", shipmentMethodUid: "courier_std", type: "normal", price: 10, currency: "EUR", minDeliveryDays: 3, maxDeliveryDays: 6, isPrivate: true, isBusiness: true },
        { name: "Pallet", shipmentMethodUid: "pallet", type: "pallet", price: 1, currency: "EUR", isPrivate: false, isBusiness: true },
      ];
      if (!state.noExpress) methods.push({ name: "Express", shipmentMethodUid: "courier_exp", type: "express", price: 30, currency: "EUR", minDeliveryDays: 1, maxDeliveryDays: 2 });
      return json(200, { orderReferenceId: body.orderReferenceId, quotes: [{ id: "q1", fulfillmentCountry: body.products[0].productUid.startsWith("framed_") ? "GB" : body.recipient.country, products: [{ productUid: body.products[0].productUid, price: 20, currency: "EUR" }], shipmentMethods: methods }] });
    }
    if (u.pathname === "/v4/orders:search") {
      const orders = body.orderReferenceIds.map((r) => state.gelato.get(r)).filter(Boolean);
      return json(200, { orders: orders.map((o) => ({ id: o.id, orderReferenceId: o.orderReferenceId, fulfillmentStatus: "created" })) });
    }
    if (u.pathname === "/v4/orders" && opts.method === "POST") {
      if (state.rejectUid && body.shipmentMethodUid === "courier_std") return json(400, { message: "Unknown shipment method" });
      const order = { id: "gel_" + (state.gelato.size + 1), ...body };
      state.gelato.set(body.orderReferenceId, order);
      return json(200, order);
    }
    if (u.pathname.startsWith("/v4/orders/")) {
      const o = [...state.gelato.values()].find((x) => x.id === decodeURIComponent(u.pathname.split("/").pop()));
      return json(200, { ...o, fulfillmentStatus: "printed", shipment: { packages: [{ trackingCode: "T1", trackingUrl: "https://track.test/T1" }] } });
    }
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

const recipient = { name: "Jo Buyer", email: "jo@example.com", line1: "1 Long St", city: "Cape Town", state: "Western Cape", postcode: "8001", country: "ZA", phone: "082 555 0123" };
const longAgo = () => new Date(Date.now() - 10 * 60 * 1000).toISOString();
const pay = (ref, mutate) => { const t = state.paystack.get(ref); t.status = "success"; t.paid_at = longAgo(); if (mutate) mutate(t); };
const zar = (eur) => Math.max(100, Math.ceil((eur * 19 * 1.15) / 10) * 10);

test("catalog lists paintings with slim and thick prices, and hides ones that can't be printed", async () => {
  const { body } = await call("catalog", { method: "GET" });
  const s = body.items["burnt-horizon"].sizes.find((x) => x.id === "12x12");
  assert.deepEqual(s.prices, { slim: 1420, thick: 2310, framed: 1650 });
  assert.equal(s.price, 1420, "'from' price is the slim one");
  assert.deepEqual(body.thicknesses.map((t) => t.id), ["slim", "thick", "framed"]);
  assert.equal(body.items["the-lookout"], undefined, "panorama has no suitable canvas shape");
  assert.equal(body.items["window-bone-and-blue"], undefined, "Picasso study held back");
});

test("quote gives standard and express delivery in rand, using the chosen depth", async () => {
  const { status, body } = await call("quote", { body: { slug: "burnt-horizon", size: "12x12", thickness: "thick", recipient } });
  assert.equal(status, 200);
  assert.equal(body.item, 2310);
  assert.equal(body.thickness, "thick");
  const [std, exp] = body.options;
  assert.equal(std.id, "standard"); assert.equal(std.shipping, zar(10)); assert.equal(std.total, 2310 + zar(10));
  assert.equal(std.minDays, 3); assert.equal(std.maxDays, 6);
  assert.equal(exp.id, "express"); assert.equal(exp.shipping, zar(30));
  assert.ok(!body.options.some((o) => o.shipping === zar(1)), "only normal/standard and express methods are offered (not pallet etc.)");
  const q = state.calls.filter((c) => c.includes("orders:quote")).length;
  assert.ok(q >= 1);
});

test("quote: no express offered when Gelato has none; unknown depth falls back to slim", async () => {
  state.noExpress = true;
  try {
    const { body } = await call("quote", { body: { slug: "burnt-horizon", size: "12x12", thickness: "made-up", recipient } });
    assert.equal(body.thickness, "slim");
    assert.equal(body.item, 1420);
    assert.deepEqual(body.options.map((o) => o.id), ["standard"]);
  } finally { state.noExpress = false; }
});

test("quote refuses wrong size, unknown painting, unsupported country, undeliverable address", async () => {
  assert.equal((await call("quote", { body: { slug: "burnt-horizon", size: "24x36", recipient } })).status, 400);
  assert.equal((await call("quote", { body: { slug: "nope", size: "12x12", recipient } })).status, 404);
  assert.equal((await call("quote", { body: { slug: "burnt-horizon", size: "12x12", recipient: { ...recipient, country: "KP" } } })).status, 400);
  state.quoteFails = true;
  try { assert.equal((await call("quote", { body: { slug: "burnt-horizon", size: "12x12", recipient } })).status, 422); }
  finally { state.quoteFails = false; }
});

test("full flow: checkout -> paid -> webhook creates one draft order, even if repeated", async () => {
  const c = await call("checkout", { body: { slug: "brothers", size: "12x18", thickness: "slim", shipping: "express", recipient, amount: 1 } });
  assert.equal(c.status, 200);
  const ref = c.body.reference;
  const tx = state.paystack.get(ref);
  assert.equal(tx.currency, "ZAR");
  assert.equal(tx.amount, (1560 + zar(30)) * 100, "amount comes from the server, ignoring the browser");
  assert.equal(tx.metadata.order.shipmentMethodUid, "courier_exp");

  let w = await call("webhook", { body: { event: "charge.success", data: { reference: ref } } });
  assert.equal(w.body.state, "unpaid");
  assert.equal(state.gelato.has(ref), false);

  pay(ref);
  w = await call("webhook", { body: { event: "charge.success", data: { reference: ref } } });
  assert.equal(w.body.state, "placed");
  const o = state.gelato.get(ref);
  assert.equal(o.orderType, "draft", "test mode never prints");
  assert.equal(o.items[0].productUid, "canvas_12x18_slim_hor", "landscape painting uses the horizontal product");
  assert.equal(o.items[0].files[0].url, "https://shop.test/images/brothers.jpg");
  assert.equal(o.shipmentMethodUid, "courier_exp");
  assert.equal(o.shippingAddress.firstName, "Jo"); assert.equal(o.shippingAddress.lastName, "Buyer");
  assert.equal(o.shippingAddress.postCode, "8001"); assert.equal(o.shippingAddress.country, "ZA");

  const count = state.gelato.size;
  await call("webhook", { body: { event: "charge.success", data: { reference: ref } } });
  const o2 = await call("order", { method: "GET", query: { ref } });
  assert.equal(o2.body.state, "placed");
  assert.equal(o2.body.tracking, "https://track.test/T1");
  assert.equal(state.gelato.size, count, "never ordered twice");
});

test("thank-you page waits for the webhook right after payment, then steps in if it never came", async () => {
  const c = await call("checkout", { body: { slug: "burnt-horizon", size: "12x12", recipient } });
  assert.equal(c.status, 200);
  const ref = c.body.reference;
  pay(ref, (t) => { t.paid_at = new Date().toISOString(); });
  let r = await call("order", { method: "GET", query: { ref } });
  assert.equal(r.body.state, "processing");
  assert.equal(state.gelato.has(ref), false, "doesn't race the webhook");
  state.paystack.get(ref).paid_at = longAgo();
  r = await call("order", { method: "GET", query: { ref } });
  assert.equal(r.body.state, "placed");
  assert.equal(state.gelato.get(ref).items[0].productUid, "canvas_12x12_slim_ver", "square canvases use the vertical product");
});

test("if the saved delivery method is no longer valid, the order still goes through by type", async () => {
  state.rejectUid = true;
  try {
    const c = await call("checkout", { body: { slug: "burnt-horizon", size: "12x12", shipping: "standard", recipient } });
    assert.equal(c.status, 200);
    pay(c.body.reference);
    const w = await call("webhook", { body: { event: "charge.success", data: { reference: c.body.reference } } });
    assert.equal(w.body.state, "placed");
    assert.equal(state.gelato.get(c.body.reference).shipmentMethodUid, "normal");
  } finally { state.rejectUid = false; }
});

test("a payment that doesn't match the expected amount is flagged, not printed", async () => {
  const c = await call("checkout", { body: { slug: "meadow-in-bloom", size: "16x16", recipient } });
  pay(c.body.reference, (t) => { t.amount = 100; });
  const w = await call("webhook", { body: { event: "charge.success", data: { reference: c.body.reference } } });
  assert.equal(w.body.state, "flagged");
  assert.equal(state.gelato.has(c.body.reference), false);
});

test("webhook ignores other events and foreign references", async () => {
  assert.equal((await call("webhook", { body: { event: "transfer.success", data: {} } })).body.ignored, "transfer.success");
  assert.equal((await call("webhook", { body: { event: "charge.success", data: { reference: "someone-elses" } } })).body.ignored, "not-our-reference");
});

test("checkout validates delivery details, including a usable phone number", async () => {
  for (const bad of [{ email: "nope" }, { line1: "" }, { phone: "" }, { phone: "abc" }]) {
    assert.equal((await call("checkout", { body: { slug: "brothers", size: "12x18", recipient: { ...recipient, ...bad } } })).status, 400, JSON.stringify(bad));
  }
});

test("live mode creates real orders and never prints from the low-res web image", async () => {
  process.env.GELATO_MODE = "live";
  try {
    const { body } = await call("catalog", { method: "GET" });
    assert.deepEqual(Object.keys(body.items), [], "no high-res files yet, so nothing is for sale");
  } finally { process.env.GELATO_MODE = "draft"; }
});

test("sizes without a Gelato product code are not offered", async () => {
  const map = require("./fake-gelato");
  const { _setGelatoProducts } = require("../api/_lib/catalog");
  const trimmed = JSON.parse(JSON.stringify(map)); delete trimmed["12x12"].thick;
  _setGelatoProducts(trimmed);
  try {
    const { body } = await call("catalog", { method: "GET" });
    assert.deepEqual(body.items["burnt-horizon"].sizes.find((x) => x.id === "12x12").prices, { slim: 1420, framed: 1650 });
    const q = await call("quote", { body: { slug: "burnt-horizon", size: "12x12", thickness: "thick", recipient } });
    assert.equal(q.status, 422);
  } finally { _setGelatoProducts(map); }
});

test("order emails: buyer confirmation and owner note go out once; a mail failure never blocks the order", async () => {
  Object.assign(process.env, { EMAILJS_SERVICE_ID: "svc", EMAILJS_PUBLIC_KEY: "pub", EMAILJS_PRIVATE_KEY: "priv", EMAILJS_ORDER_TEMPLATE: "tpl_order", EMAILJS_NOTIFY_TEMPLATE: "tpl_notify" });
  try {
    state.emails.length = 0;
    const c = await call("checkout", { body: { slug: "brothers", size: "12x18", thickness: "thick", shipping: "standard", recipient } });
    pay(c.body.reference);
    let w = await call("webhook", { body: { event: "charge.success", data: { reference: c.body.reference } } });
    assert.equal(w.body.state, "placed");
    assert.equal(state.emails.length, 2);
    const buyer = state.emails.find((e) => e.template_id === "tpl_order"), owner = state.emails.find((e) => e.template_id === "tpl_notify");
    assert.equal(buyer.template_params.to_email, "jo@example.com");
    assert.equal(buyer.template_params.order_ref, c.body.reference);
    assert.equal(buyer.template_params.painting, "Kings at Rest");
    assert.match(buyer.template_params.size, /^18 x 12 in .*thick canvas, standard delivery$/, "landscape painting is described wide, with depth and delivery");
    assert.equal(buyer.template_params.total, `R ${String(2550 + zar(10)).replace(/\B(?=(\d{3})+(?!\d))/g, " ")}`);
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

test("framed prints: frame colour picks the product, printed abroad is flagged, and only sizes Gelato frames are offered", async () => {
  const { body } = await call("catalog", { method: "GET" });
  const sizes = body.items["burnt-horizon"].sizes;
  assert.equal(sizes.find((x) => x.id === "12x12").prices.framed, 1650);
  assert.ok(body.thicknesses.find((t) => t.id === "framed").frames.length === 4);
  const q = await call("quote", { body: { slug: "burnt-horizon", size: "12x12", thickness: "framed", frame: "dark-wood", recipient } });
  assert.equal(q.status, 200);
  assert.equal(q.body.item, 1650); assert.equal(q.body.frame, "dark-wood"); assert.equal(q.body.crossBorder, true);
  const canvasQ = await call("quote", { body: { slug: "burnt-horizon", size: "12x12", thickness: "slim", recipient } });
  assert.equal(canvasQ.body.crossBorder, false, "canvas is printed in South Africa");
  const odd = await call("quote", { body: { slug: "burnt-horizon", size: "12x12", thickness: "framed", frame: "purple", recipient } });
  assert.equal(odd.body.frame, "black", "unknown colour falls back to the first one");

  Object.assign(process.env, { EMAILJS_SERVICE_ID: "svc", EMAILJS_PUBLIC_KEY: "pub", EMAILJS_PRIVATE_KEY: "priv", EMAILJS_ORDER_TEMPLATE: "tpl_order", EMAILJS_NOTIFY_TEMPLATE: "tpl_notify" });
  try {
    state.emails.length = 0;
    const c = await call("checkout", { body: { slug: "brothers", size: "12x18", thickness: "framed", frame: "wood", shipping: "standard", recipient } });
    assert.equal(c.status, 200);
    assert.equal(state.paystack.get(c.body.reference).metadata.order.frame, "wood");
    pay(c.body.reference);
    const w = await call("webhook", { body: { event: "charge.success", data: { reference: c.body.reference } } });
    assert.equal(w.body.state, "placed");
    assert.equal(state.gelato.get(c.body.reference).items[0].productUid, "framed_12x18_wood_hor");
    const buyer = state.emails.find((e) => e.template_id === "tpl_order");
    assert.match(buyer.template_params.size, /framed print, wood frame, standard delivery$/);
  } finally {
    for (const k of ["EMAILJS_SERVICE_ID", "EMAILJS_PUBLIC_KEY", "EMAILJS_PRIVATE_KEY", "EMAILJS_ORDER_TEMPLATE", "EMAILJS_NOTIFY_TEMPLATE"]) delete process.env[k];
  }
});
