const { handler, send, siteUrl } = require("./_lib/http");
const { price, cleanRecipient, newReference } = require("./_lib/shop");
const paystack = require("./_lib/paystack");

// POST { slug, size, recipient } -> { url } to send the customer to Paystack's payment page.
// The price is worked out here, on the server. Nothing the browser says about money is trusted.
module.exports = handler(["POST"], async (req, res) => {
  const b = req.body || {};
  const recipient = cleanRecipient(b.recipient);
  const base = siteUrl(req);
  const p = await price({ slug: b.slug, sizeId: b.size, country: recipient.country, siteBase: base });
  const reference = newReference();
  const expectedCents = p.totalZAR * 100;

  const tx = await paystack.initialize({
    email: recipient.email,
    amount: expectedCents,
    currency: "ZAR",
    reference,
    callback_url: `${base}/?order=${reference}`,
    metadata: {
      cancel_action: `${base}/`,
      order: { slug: p.slug, size: p.sizeId, expectedCents, recipient },
      custom_fields: [
        { display_name: "Painting", variable_name: "painting", value: p.title },
        { display_name: "Canvas size (in)", variable_name: "size", value: p.sizeId },
      ],
    },
  });
  send(res, 200, { url: tx.authorization_url, reference });
});
