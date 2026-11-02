// Run `npm run check-skus` (after putting your Prodigi key in .env).
// For every canvas size it checks that Prodigi recognises the product code,
// then asks for the real cost to make it and ship it to South Africa, so you
// can set sensible prices in shop/catalog.json.
const { catalog } = require("../api/_lib/catalog");
const prodigi = require("../api/_lib/prodigi");

const fx = Number(process.env.FX_RATE || 24);
const country = (process.argv[2] || "ZA").toUpperCase();

(async () => {
  console.log(`Prodigi ${process.env.PRODIGI_ENV || "sandbox"} | shipping to ${country} | FX ${fx} ZAR per ${process.env.PRODIGI_CURRENCY || "GBP"}\n`);
  console.log("size    orient     sku                  status   make   ship   cost(R)  your price  margin");
  let bad = 0;
  for (const s of catalog.sizes) {
    for (const orient of s.w === s.h ? ["square"] : ["portrait", "landscape"]) {
      const sku = `${catalog.skuPrefix}-${orient === "landscape" ? `${s.h}X${s.w}` : `${s.w}X${s.h}`}`;
      let status = "ok", make = "-", ship = "-", costR = "-", margin = "-";
      try {
        const p = await prodigi.getProduct(sku);
        const wraps = p.product && p.product.attributes && p.product.attributes.wrap;
        if (wraps && !wraps.includes(catalog.wrap)) status = "no-wrap";
        const q = await prodigi.quote({ sku, country, wrap: catalog.wrap });
        make = q.itemCost.toFixed(2); ship = q.shippingCost.toFixed(2);
        const cost = (q.itemCost + q.shippingCost) * fx;
        costR = Math.round(cost);
        margin = Math.round(((s.price - q.itemCost * fx) / s.price) * 100) + "% before shipping";
      } catch (e) {
        status = e.prodigiStatus === 404 ? "UNKNOWN" : "error";
        bad++;
      }
      console.log(`${s.id.padEnd(7)} ${orient.padEnd(10)} ${sku.padEnd(20)} ${status.padEnd(8)} ${String(make).padEnd(6)} ${String(ship).padEnd(6)} ${String(costR).padEnd(8)} R${String(s.price).padEnd(10)} ${margin}`);
    }
  }
  console.log(bad ? `\n${bad} size(s) need attention: UNKNOWN means Prodigi doesn't offer that code. Remove the size from shop/catalog.json or send me this output.` : "\nAll product codes recognised.");
})().catch((e) => { console.error(e.message, e.detail || ""); process.exit(1); });
