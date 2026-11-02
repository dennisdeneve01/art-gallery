const { handler, send, siteUrl, HttpError } = require("./_lib/http");
const { placeOrder, validReference } = require("./_lib/shop");
const prodigi = require("./_lib/prodigi");

// GET ?ref=DH-... -> status for the thank-you page. If Paystack's webhook hasn't
// arrived yet, this also makes sure the print order is placed (safe to repeat).
module.exports = handler(["GET"], async (req, res) => {
  const ref = String((req.query && req.query.ref) || "");
  if (!validReference(ref)) throw new HttpError(400, "Unknown order reference.");
  const result = await placeOrder(ref, siteUrl(req));
  if (result.state === "unpaid") return send(res, 200, { state: "unpaid" });
  if (result.state === "flagged") return send(res, 200, { state: "review" });
  let stage = null, tracking = null;
  try {
    const order = await prodigi.findOrderByReference(ref);
    stage = order && order.status && order.status.stage;
    const ship = order && order.shipments && order.shipments[0];
    if (ship && ship.tracking && ship.tracking.url) tracking = ship.tracking.url;
  } catch (e) { /* status is a nice-to-have */ }
  send(res, 200, { state: "placed", stage, tracking });
});
