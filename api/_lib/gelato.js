// Gelato print API (Order API v4, Product API v3). Gelato prints each canvas in
// the lab closest to the buyer (South Africa, UK, US, EU, Australia ...).
//
// Test mode: GELATO_MODE=draft (the default) creates *draft* orders, which Gelato
// never prints or charges for. Set GELATO_MODE=live to print for real.
const { HttpError } = require("./http");

const ORDER = "https://order.gelatoapis.com";
const PRODUCT = "https://product.gelatoapis.com/v3";
const currency = () => process.env.GELATO_CURRENCY || "EUR";
const isLive = () => (process.env.GELATO_MODE || "draft").toLowerCase() === "live";

async function call(base, method, path, body) {
  const key = process.env.GELATO_API_KEY;
  if (!key) throw new Error("GELATO_API_KEY is not set");
  const r = await fetch(base + path, {
    method,
    headers: { "X-API-KEY": key, "Content-Type": "application/json", Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { /* not JSON */ }
  if (!r.ok) {
    const err = new HttpError(r.status >= 400 && r.status < 500 ? 422 : 502, `Gelato ${method} ${path} failed (${r.status})`, json || text);
    err.gelatoStatus = r.status;
    throw err;
  }
  return json || {};
}

// Gelato wants first and last name separately, with length limits.
function address(r) {
  const parts = String(r.name || "").trim().split(/\s+/);
  const first = parts.shift() || "Customer";
  const last = parts.join(" ") || first;
  return {
    firstName: first.slice(0, 25), lastName: last.slice(0, 25),
    addressLine1: String(r.line1 || "").slice(0, 35), addressLine2: r.line2 ? String(r.line2).slice(0, 35) : undefined,
    city: String(r.city || "").slice(0, 30), postCode: String(r.postcode || "").slice(0, 15),
    state: r.state || undefined, country: r.country, email: r.email, phone: r.phone ? String(r.phone).slice(0, 25) : undefined,
  };
}

const num = (x) => (x == null || x === "" ? null : Number(x));

// The cheapest "standard" and "express" ways to get one canvas to this address.
// -> { currency, itemCost, fulfillmentCountry, standard: {uid, price, minDays, maxDays} | null, express: ... | null }
async function quote({ productUid, recipient, fileUrl }) {
  const out = await call(ORDER, "POST", "/v4/orders:quote", {
    orderReferenceId: "quote-" + Date.now(),
    customerReferenceId: "quote",
    currency: currency(),
    allowMultipleQuotes: false,
    recipient: address(recipient),
    products: [{ itemReferenceId: "1", productUid, quantity: 1, files: fileUrl ? [{ type: "default", url: fileUrl }] : undefined }],
  });
  const q = (out.quotes || [])[0];
  if (!q) throw new HttpError(422, "No delivery available to that address", out);
  const itemCost = (q.products || []).reduce((t, p) => t + (num(p.price) || 0), 0);
  // (isPrivate / isBusiness say which kinds of address a method delivers to, so they don't filter anything here)
  const methods = (q.shipmentMethods || []).filter((m) => num(m.price) != null);
  const pick = (types) => methods.filter((m) => types.includes(String(m.type).toLowerCase())).sort((a, b) => num(a.price) - num(b.price))[0] || null;
  const shape = (m) => m && { uid: m.shipmentMethodUid, name: m.name, price: num(m.price), minDays: num(m.minDeliveryDays), maxDays: num(m.maxDeliveryDays), incoTerms: m.incoTerms || null };
  const standard = shape(pick(["normal", "standard"]) || methods.slice().sort((a, b) => num(a.price) - num(b.price))[0]);
  let express = shape(pick(["express"]));
  if (express && standard && express.uid === standard.uid) express = null;
  if (!standard) throw new HttpError(422, "No delivery available to that address", out);
  return { currency: q.currency || currency(), itemCost, fulfillmentCountry: q.fulfillmentCountry || q.productionCountry || null, standard, express, duties: standard && standard.incoTerms || null };
}

// Our order, if Gelato already has it (drafts included).
async function findOrderByReference(reference) {
  const out = await call(ORDER, "POST", "/v4/orders:search", { orderReferenceIds: [reference], orderTypes: ["order", "draft"], limit: 1 });
  return (out.orders || []).find((o) => o.orderReferenceId === reference) || null;
}

async function getOrder(id) {
  return call(ORDER, "GET", `/v4/orders/${encodeURIComponent(id)}`);
}

// Places the print order. Gelato has no idempotency key, so we look first and
// only create when there isn't already an order with this reference.
async function createOrder({ reference, recipient, productUid, fileUrl, shipmentMethodUid, shippingType }) {
  const existing = await findOrderByReference(reference);
  if (existing) return { id: existing.id, outcome: "AlreadyExists" };
  const body = (method) => ({
    orderType: isLive() ? "order" : "draft",
    orderReferenceId: reference,
    customerReferenceId: String(recipient.email || reference).slice(0, 100),
    currency: currency(),
    items: [{ itemReferenceId: `${reference}-1`, productUid, quantity: 1, files: [{ type: "default", url: fileUrl }] }],
    shipmentMethodUid: method,
    shippingAddress: address(recipient),
    metadata: [{ key: "source", value: "art-gallery" }],
  });
  let out;
  try {
    out = await call(ORDER, "POST", "/v4/orders", body(shipmentMethodUid || shippingType || "normal"));
  } catch (e) {
    // The exact method from checkout may have been retired since; fall back to the cheapest of the same kind.
    if (!(e.gelatoStatus >= 400 && e.gelatoStatus < 500) || !shipmentMethodUid) throw e;
    console.warn("[gelato] shipment method rejected, retrying by type", reference, shipmentMethodUid);
    out = await call(ORDER, "POST", "/v4/orders", body(shippingType === "express" ? "express" : "normal"));
  }
  if (!out.id) throw new HttpError(502, "Gelato did not accept the order", out);
  return { id: out.id, outcome: "Created", order: out };
}

// Product catalogue (used by scripts/gelato-products.js).
const catalogInfo = (uid) => call(PRODUCT, "GET", `/catalogs/${encodeURIComponent(uid)}`);
const listCatalogs = () => call(PRODUCT, "GET", "/catalogs");
const searchProducts = (uid, body) => call(PRODUCT, "POST", `/catalogs/${encodeURIComponent(uid)}/products:search`, body);

module.exports = { quote, createOrder, findOrderByReference, getOrder, catalogInfo, listCatalogs, searchProducts, isLive, address };
