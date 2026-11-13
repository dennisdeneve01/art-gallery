const { handler, send, siteUrl, HttpError } = require("./_lib/http");
const { placeOrder, validReference } = require("./_lib/shop");
const gelato = require("./_lib/gelato");

// GET ?ref=DH-... -> status for the thank-you page. If Paystack's webhook hasn't
// arrived a while after payment, this also makes sure the print order is placed.
module.exports = handler(["GET"], async (req, res) => {
  const ref = String((req.query && req.query.ref) || "");
  if (!validReference(ref)) throw new HttpError(400, "Unknown order reference.");
  const result = await placeOrder(ref, siteUrl(req));
  if (result.state === "unpaid" || result.state === "processing") return send(res, 200, { state: result.state });
  if (result.state === "flagged") return send(res, 200, { state: "review" });
  let stage = null, tracking = null;
  try {
    const order = await gelato.getOrder(result.gelatoOrderId);
    stage = order && order.fulfillmentStatus;
    const pkg = order && order.shipment && (order.shipment.packages || [])[0];
    if (pkg && pkg.trackingUrl) tracking = pkg.trackingUrl;
  } catch (e) { /* status is a nice-to-have */ }
  send(res, 200, { state: "placed", stage, tracking });
});
