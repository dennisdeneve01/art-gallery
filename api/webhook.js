const { handler, send, siteUrl } = require("./_lib/http");
const { placeOrder, validReference } = require("./_lib/shop");
const crypto = require("crypto");

// Paystack calls this when a payment succeeds (set the URL in Paystack ->
// Settings -> API Keys & Webhooks).
//
// We deliberately don't act on what the request *says*. We only take the
// payment reference out of it and ask Paystack directly whether that payment
// really succeeded (inside placeOrder), so a forged call can't print anything.
// The signature check is logged as an extra warning sign rather than used to
// reject, because some hosts re-serialise the body and break byte-exact checks.
module.exports = handler(["POST"], async (req, res) => {
  const body = req.body || {};
  try {
    const expected = crypto.createHmac("sha512", process.env.PAYSTACK_SECRET_KEY || "").update(JSON.stringify(body)).digest("hex");
    if (req.headers["x-paystack-signature"] !== expected) console.warn("[webhook] signature did not match re-serialised body (continuing: payment is verified with Paystack directly)");
  } catch (e) { /* ignore */ }

  if (body.event !== "charge.success") return send(res, 200, { ok: true, ignored: body.event || null });
  const reference = body.data && body.data.reference;
  if (!validReference(reference)) return send(res, 200, { ok: true, ignored: "not-our-reference" });

  // If this throws (Prodigi down, say), the handler returns 500 and Paystack retries later.
  const result = await placeOrder(reference, siteUrl(req));
  send(res, 200, { ok: true, state: result.state });
});
