// Prodigi print API (v4). Sandbox and live use different hosts and keys.
const { HttpError } = require("./http");

const base = () =>
  (process.env.PRODIGI_ENV || "sandbox").toLowerCase() === "live"
    ? "https://api.prodigi.com"
    : "https://api.sandbox.prodigi.com";

async function call(method, path, body) {
  const key = process.env.PRODIGI_API_KEY;
  if (!key) throw new Error("PRODIGI_API_KEY is not set");
  const r = await fetch(base() + path, {
    method,
    headers: { "X-API-Key": key, "Content-Type": "application/json", Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { /* not JSON */ }
  if (!r.ok) {
    const err = new HttpError(r.status === 400 ? 422 : 502, `Prodigi ${method} ${path} failed (${r.status})`, json || text);
    err.prodigiStatus = r.status;
    throw err;
  }
  return json || {};
}

// What would it cost to make and ship one canvas to this country?
async function quote({ sku, country, wrap }) {
  const currency = process.env.PRODIGI_CURRENCY || "GBP";
  const method = process.env.SHIPPING_METHOD || "Standard";
  const out = await call("POST", "/v4.0/quotes", {
    shippingMethod: method,
    destinationCountryCode: country,
    currencyCode: currency,
    items: [{ sku, copies: 1, attributes: { wrap }, assets: [{ printArea: "default" }] }],
  });
  const quotes = out.quotes || [];
  const q = quotes.find((x) => String(x.shipmentMethod).toLowerCase() === method.toLowerCase()) || quotes[0];
  if (!q || !q.costSummary) throw new HttpError(422, "No shipping quote available", out);
  const num = (x) => (x && x.amount != null ? Number(x.amount) : 0);
  return {
    currency: (q.costSummary.shipping && q.costSummary.shipping.currency) || currency,
    itemCost: num(q.costSummary.items),
    shippingCost: num(q.costSummary.shipping),
    labCountry: q.shipments && q.shipments[0] && q.shipments[0].fulfillmentLocation && q.shipments[0].fulfillmentLocation.countryCode,
  };
}

// Places the print order. `idempotencyKey` means Prodigi will never create a
// second order for the same payment, even if we call this twice.
async function createOrder({ reference, recipient, sku, wrap, assetUrl }) {
  const out = await call("POST", "/v4.0/orders", {
    merchantReference: reference,
    idempotencyKey: reference,
    shippingMethod: process.env.SHIPPING_METHOD || "Standard",
    recipient: {
      name: recipient.name,
      email: recipient.email,
      phoneNumber: recipient.phone || undefined,
      address: {
        line1: recipient.line1,
        line2: recipient.line2 || undefined,
        townOrCity: recipient.city,
        stateOrCounty: recipient.state || undefined,
        postalOrZipCode: recipient.postcode,
        countryCode: recipient.country,
      },
    },
    items: [
      {
        merchantReference: `${reference}-1`,
        sku,
        copies: 1,
        sizing: "fillPrintArea",
        attributes: { wrap },
        assets: [{ printArea: "default", url: assetUrl }],
      },
    ],
  });
  const outcome = String(out.outcome || "");
  if (!/^(created|createdwithissues|alreadyexists)$/i.test(outcome) || !out.order) {
    throw new HttpError(502, `Prodigi did not accept the order (${outcome || "no outcome"})`, out);
  }
  if (/issues/i.test(outcome)) console.error("[ORDER NEEDS ATTENTION] Prodigi created the order with issues", reference, JSON.stringify(out));
  return { id: out.order.id, outcome, order: out.order };
}

// Latest status for an order we already placed (best effort, for the thank-you page).
async function findOrderByReference(reference) {
  const out = await call("GET", `/v4.0/orders?merchantReference=${encodeURIComponent(reference)}&top=1`);
  return (out.orders && out.orders[0]) || null;
}

async function getProduct(sku) {
  return call("GET", `/v4.0/products/${encodeURIComponent(sku)}`);
}

module.exports = { quote, createOrder, findOrderByReference, getProduct, base };
