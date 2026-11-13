const { handler, send, siteUrl, HttpError } = require("./_lib/http");
const { price, cleanRecipient, newReference } = require("./_lib/shop");
const paystack = require("./_lib/paystack");

// POST { slug, size, thickness, shipping: "standard"|"express", recipient } -> { url } for Paystack's payment page.
// The price is worked out here, on the server. Nothing the browser says about money is trusted.
module.exports = handler(["POST"], async (req, res) => {
  const b = req.body || {};
  const recipient = cleanRecipient(b.recipient);
  const base = siteUrl(req);
  const p = await price({ slug: b.slug, sizeId: b.size, thickness: b.thickness, frame: b.frame, recipient, siteBase: base });
  const option = p.options.find((o) => o.id === b.shipping) || p.options[0];
  if (!option) throw new HttpError(422, "We can't deliver to that address right now.");
  const reference = newReference();
  const expectedCents = option.totalZAR * 100;

  const tx = await paystack.initialize({
    email: recipient.email,
    amount: expectedCents,
    currency: "ZAR",
    reference,
    callback_url: `${base}/?order=${reference}`,
    metadata: {
      cancel_action: `${base}/`,
      order: { slug: p.slug, size: p.sizeId, thickness: p.thickness, frame: p.frame, shipping: option.id, shipmentMethodUid: option.uid, expectedCents, recipient },
      custom_fields: [
        { display_name: "Painting", variable_name: "painting", value: p.title },
        { display_name: "Print", variable_name: "size", value: `${p.sizeId} in, ${p.thickness}${p.frame ? ", " + p.frame + " frame" : ""}` },
        { display_name: "Delivery", variable_name: "delivery", value: option.label },
      ],
    },
  });
  send(res, 200, { url: tx.authorization_url, reference });
});
