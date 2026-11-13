const { handler, send, siteUrl } = require("./_lib/http");
const { price, cleanRecipient } = require("./_lib/shop");

// POST { slug, size, thickness, frame, recipient } -> the delivered price for each delivery option.
module.exports = handler(["POST"], async (req, res) => {
  const b = req.body || {};
  const recipient = cleanRecipient(b.recipient);
  const p = await price({ slug: b.slug, sizeId: b.size, thickness: b.thickness, frame: b.frame, recipient, siteBase: siteUrl(req) });
  send(res, 200, {
    item: p.itemZAR, thickness: p.thickness, frame: p.frame, crop: p.crop, crossBorder: p.crossBorder,
    options: p.options.map((o) => ({ id: o.id, label: o.label, shipping: o.shippingZAR, total: o.totalZAR, minDays: o.minDays, maxDays: o.maxDays })),
  });
});
