const { handler, send, siteUrl } = require("./_lib/http");
const { catalog, sizesFor, orientationOf, offered, priceOf, THICKNESSES } = require("./_lib/catalog");
const printFiles = require("./_lib/printFiles");

// What the website needs to know to show "Buy a canvas print" buttons:
// which paintings can be bought, in which sizes, at what price.
module.exports = handler(["GET"], async (req, res) => {
  const base = siteUrl(req);
  const items = {};
  for (const [slug, piece] of Object.entries(catalog.pieces)) {
    if (!printFiles.resolve(slug, base)) continue;
    const list = sizesFor(piece);
    if (!list.length) continue;
    const entry = {
      orientation: orientationOf(piece),
      sizes: list
        .filter((x) => THICKNESSES.some((t) => priceOf(x.size, t) && offered(piece, x.size, t)))
        .map((x) => ({
          id: x.size.id, w: x.size.w, h: x.size.h, cm: x.size.cm, price: x.size.price, crop: Math.round(x.crop * 1000) / 1000,
          prices: Object.fromEntries(THICKNESSES.filter((t) => priceOf(x.size, t) && offered(piece, x.size, t)).map((t) => [t, priceOf(x.size, t)])),
        })),
    };
    if (!entry.sizes.length) continue;
    items[slug] = entry;
  }
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300");
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify({
    currency: catalog.currency,
    wrapNote: catalog.wrapNote,
    thicknesses: catalog.thicknesses,
    countries: catalog.countries,
    items,
  }));
});
