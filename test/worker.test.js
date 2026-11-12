// The Worker routes /api/* to the shop handlers and everything else to the static files.
const test = require("node:test");
const assert = require("node:assert/strict");

test("worker routes api paths, 404s unknown api paths, passes the rest to assets", async () => {
  process.env.PRODIGI_ENV = "sandbox";
  const worker = (await import("../src/worker.mjs")).default;
  const env = { ASSETS: { fetch: async (r) => new Response("static:" + new URL(r.url).pathname) } };
  const cat = await worker.fetch(new Request("https://shop.test/api/catalog"), env);
  assert.equal(cat.status, 200);
  assert.equal((await cat.json()).currency, "ZAR");
  assert.equal((await worker.fetch(new Request("https://shop.test/api/nope"), env)).status, 404);
  assert.equal(await (await worker.fetch(new Request("https://shop.test/images/a.jpg"), env)).text(), "static:/images/a.jpg");
  assert.equal(await (await worker.fetch(new Request("https://shop.test/"), env)).text(), "static:/");
});
