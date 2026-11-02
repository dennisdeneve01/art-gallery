// The shop's brain: pricing a basket, and turning a paid order into a print order.
const crypto = require("crypto");
const { HttpError } = require("./http");
const { catalog, sizeById, sizesFor, skuFor, cropFor } = require("./catalog");
const printFiles = require("./printFiles");
const prodigi = require("./prodigi");
const paystack = require("./paystack");

const COUNTRIES = new Set(catalog.countries.map((c) => c.code));

function pieceFor(slug) {
  const piece = typeof slug === "string" && Object.prototype.hasOwnProperty.call(catalog.pieces, slug) ? catalog.pieces[slug] : null;
  if (!piece) throw new HttpError(404, "That painting isn't available as a print.");
  return piece;
}

// Works out what one canvas costs, delivered. All numbers are rand.
async function price({ slug, sizeId, country, siteBase }) {
  const piece = pieceFor(slug);
  const size = sizeById(sizeId);
  if (!size || !sizesFor(piece).some((x) => x.size.id === size.id)) throw new HttpError(400, "That size isn't available for this painting.");
  if (!COUNTRIES.has(country)) throw new HttpError(400, "We don't ship to that country yet.");
  const file = printFiles.resolve(slug, siteBase);
  if (!file) throw new HttpError(404, "That painting isn't available as a print right now.");

  const sku = skuFor(piece, size);
  let q;
  try {
    q = await prodigi.quote({ sku, country, wrap: catalog.wrap });
  } catch (e) {
    if (e.status && e.status < 500) throw new HttpError(422, "We can't ship that canvas to your country right now.");
    throw e;
  }
  const fx = Number(process.env.FX_RATE || 24);
  const markup = Number(process.env.SHIPPING_MARKUP || 0.15);
  const rawShipping = q.shippingCost * fx * (1 + markup);
  const shippingZAR = Math.max(catalog.minShippingZAR || 0, Math.ceil(rawShipping / 10) * 10);
  const itemZAR = size.price;
  return {
    slug, title: piece.title, sizeId: size.id, sku, country, lowRes: file.lowRes,
    itemZAR, shippingZAR, totalZAR: itemZAR + shippingZAR,
    crop: cropFor(piece, size),
  };
}

const clean = (v, max = 120) => String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);

function cleanRecipient(r) {
  const out = {
    name: clean(r && r.name, 100), email: clean(r && r.email, 120).toLowerCase(), phone: clean(r && r.phone, 30),
    line1: clean(r && r.line1), line2: clean(r && r.line2), city: clean(r && r.city, 80),
    state: clean(r && r.state, 80), postcode: clean(r && r.postcode, 20), country: clean(r && r.country, 2).toUpperCase(),
  };
  const missing = ["name", "email", "line1", "city", "postcode", "country"].filter((k) => !out[k]);
  if (missing.length) throw new HttpError(400, "Please fill in all the required delivery details.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(out.email)) throw new HttpError(400, "That email address doesn't look right.");
  return out;
}

const newReference = () => "DH-" + Date.now().toString(36).toUpperCase() + "-" + crypto.randomBytes(3).toString("hex").toUpperCase();
const validReference = (ref) => typeof ref === "string" && /^DH-[A-Z0-9]+-[A-F0-9]{6}$/.test(ref);

// Called once payment is confirmed (by Paystack's webhook, or by the thank-you
// page checking in). It re-checks the payment with Paystack itself rather than
// trusting whoever called, and Prodigi's idempotency key makes repeat calls safe.
async function placeOrder(reference, siteBase) {
  const tx = await paystack.verify(reference);
  if (tx.status !== "success") return { state: "unpaid", paystackStatus: tx.status };

  const o = tx.metadata && tx.metadata.order;
  if (!o || !o.recipient) {
    console.error("[ORDER FLAGGED] paid but no order details in Paystack metadata", reference);
    return { state: "flagged", reason: "missing-details" };
  }
  if (tx.currency !== "ZAR" || Number(tx.amount) !== Number(o.expectedCents)) {
    console.error("[ORDER FLAGGED] amount mismatch — NOT sent to print", reference, "paid", tx.amount, tx.currency, "expected", o.expectedCents);
    return { state: "flagged", reason: "amount-mismatch" };
  }
  const piece = catalog.pieces[o.slug];
  const size = sizeById(o.size);
  const file = piece && printFiles.resolve(o.slug, siteBase);
  if (!piece || !size || !file) {
    console.error("[ORDER FLAGGED] cannot print (unknown painting/size/file)", reference, o.slug, o.size);
    return { state: "flagged", reason: "cannot-print" };
  }
  const placed = await prodigi.createOrder({
    reference, recipient: o.recipient, sku: skuFor(piece, size), wrap: catalog.wrap, assetUrl: file.url,
  });
  console.log("[ORDER PLACED]", reference, "->", placed.id, placed.outcome);
  return { state: "placed", prodigiOrderId: placed.id, outcome: placed.outcome, lowRes: file.lowRes };
}

module.exports = { price, cleanRecipient, newReference, validReference, placeOrder, COUNTRIES };
