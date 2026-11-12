// Checks the Cloudflare adapter turns Request/Response into the (req, res) the shop code expects.
const test = require("node:test");
const assert = require("node:assert/strict");

async function load() { return (await import("../cf/adapter.mjs")).run; }

test("adapter passes method, query, JSON body and raw body; returns status, headers, body", async () => {
  const run = await load();
  let seen;
  const fn = run(async (req, res) => {
    seen = req;
    res.statusCode = 201;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true }));
  });
  const r = await fn({ request: new Request("https://shop.test/api/x?ref=DH-1", { method: "POST", headers: { "Content-Type": "application/json", "X-Paystack-Signature": "abc" }, body: '{"a":1}' }), env: {} });
  assert.equal(r.status, 201);
  assert.equal(r.headers.get("content-type"), "application/json");
  assert.deepEqual(await r.json(), { ok: true });
  assert.equal(seen.method, "POST");
  assert.equal(seen.query.ref, "DH-1");
  assert.deepEqual(seen.body, { a: 1 });
  assert.equal(seen.rawBody, '{"a":1}');
  assert.equal(seen.headers["x-paystack-signature"], "abc");
  assert.equal(seen.headers.host, "shop.test");
  assert.equal(seen.headers["x-forwarded-proto"], "https");
});

test("adapter copies Cloudflare settings into process.env and survives a crashing handler", async () => {
  const run = await load();
  await run(async (req, res) => res.end("x"))({ request: new Request("https://shop.test/"), env: { SOME_SETTING: "1", NOT_A_STRING: {} } });
  assert.equal(process.env.SOME_SETTING, "1");
  assert.equal(process.env.NOT_A_STRING, undefined);
  const r = await run(async () => { throw new Error("boom"); })({ request: new Request("https://shop.test/"), env: {} });
  assert.equal(r.status, 500);
});

test("real shop handlers work through the adapter (catalog, wrong method)", async () => {
  process.env.PRODIGI_ENV = "sandbox";
  const run = await load();
  const catalog = run(require("../api/catalog.js"));
  const ok = await catalog({ request: new Request("https://shop.test/api/catalog"), env: {} });
  assert.equal(ok.status, 200);
  const j = await ok.json();
  assert.equal(j.currency, "ZAR");
  assert.ok(Object.keys(j.items).length > 0);
  const bad = await catalog({ request: new Request("https://shop.test/api/catalog", { method: "POST", body: "{}" }), env: {} });
  assert.equal(bad.status, 405);
});
