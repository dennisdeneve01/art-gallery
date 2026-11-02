const { handler, send, siteUrl, HttpError } = require("./_lib/http");
const { price } = require("./_lib/shop");

// POST { slug, size, country } -> what it costs, delivered.
module.exports = handler(["POST"], async (req, res) => {
  const b = req.body || {};
  const p = await price({ slug: b.slug, sizeId: b.size, country: String(b.country || "").toUpperCase(), siteBase: siteUrl(req) });
  send(res, 200, { item: p.itemZAR, shipping: p.shippingZAR, total: p.totalZAR, crop: p.crop });
});
