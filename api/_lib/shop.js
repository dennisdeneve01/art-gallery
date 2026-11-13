// The shop's brain: pricing a basket, and turning a paid order into a print order.
const crypto = require("crypto");
const { HttpError } = require("./http");
const { catalog, sizeById, sizesFor, productUidFor, framesOf, priceOf, THICKNESSES, cropFor, orientationOf } = require("./catalog");
const printFiles = require("./printFiles");
const gelato = require("./gelato");
const paystack = require("./paystack");
const { orderEmails } = require("./email");

const COUNTRIES = new Set(catalog.countries.map((c) => c.code));

function pieceFor(slug) {
  const piece = typeof slug === "string" && Object.prototype.hasOwnProperty.call(catalog.pieces, slug) ? catalog.pieces[slug] : null;
  if (!piece) throw new HttpError(404, "That painting isn't available as a print.");
  return piece;
}

// Works out what one canvas costs, delivered to this address, for each delivery
// option Gelato offers (standard, and express where available). All rand.
async function price({ slug, sizeId, thickness, frame, recipient, siteBase }) {
  const piece = pieceFor(slug);
  const size = sizeById(sizeId);
  if (!size || !sizesFor(piece).some((x) => x.size.id === size.id)) throw new HttpError(400, "That size isn't available for this painting.");
  const thick = THICKNESSES.includes(thickness) ? thickness : THICKNESSES[0];
  const frames = framesOf(thick);
  const frameId = frames.length ? (frames.includes(frame) ? frame : frames[0]) : null;
  const itemZAR = priceOf(size, thick);
  if (!itemZAR) throw new HttpError(400, "That canvas isn't available in this size.");
  const country = recipient.country;
  if (!COUNTRIES.has(country)) throw new HttpError(400, "We don't ship to that country yet.");
  const file = printFiles.resolve(slug, siteBase);
  if (!file) throw new HttpError(404, "That painting isn't available as a print right now.");
  const productUid = productUidFor(piece, size, thick, frameId);
  if (!productUid) {
    console.error("[SHOP] no Gelato product code for", size.id, thick, "- run npm run gelato-products");
    throw new HttpError(422, "That canvas can't be ordered right now. Please try another size, or get in touch.");
  }

  let q;
  try {
    q = await gelato.quote({ productUid, recipient, fileUrl: file.url });
  } catch (e) {
    if (e.status && e.status < 500) throw new HttpError(422, "We can't deliver that canvas to this address right now. Please check the address, or get in touch.");
    throw e;
  }
  const fx = Number(process.env.FX_RATE || 19);
  const markup = Number(process.env.SHIPPING_MARKUP || 0.15);
  const toZAR = (cost) => Math.max(catalog.minShippingZAR || 0, Math.ceil((cost * fx * (1 + markup)) / 10) * 10);
  const option = (id, label, m) => m && {
    id, label, uid: m.uid, shippingZAR: toZAR(m.price), totalZAR: itemZAR + toZAR(m.price), minDays: m.minDays, maxDays: m.maxDays,
  };
  const options = [option("standard", "Standard delivery", q.standard), option("express", "Express delivery", q.express)].filter(Boolean);
  return {
    slug, title: piece.title, sizeId: size.id, thickness: thick, frame: frameId, productUid, country, lowRes: file.lowRes,
    itemZAR, options, fulfillmentCountry: q.fulfillmentCountry, crop: cropFor(piece, size),
    // printed in another country: the buyer may pay import duties or taxes on delivery
    crossBorder: !!(q.fulfillmentCountry && String(q.fulfillmentCountry).toUpperCase() !== country),
  };
}

const clean = (v, max = 120) => String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);

function cleanRecipient(r) {
  const out = {
    name: clean(r && r.name, 100), email: clean(r && r.email, 120).toLowerCase(), phone: clean(r && r.phone, 30),
    line1: clean(r && r.line1), line2: clean(r && r.line2), city: clean(r && r.city, 80),
    state: clean(r && r.state, 80), postcode: clean(r && r.postcode, 20), country: clean(r && r.country, 2).toUpperCase(),
  };
  const missing = ["name", "email", "phone", "line1", "city", "postcode", "country"].filter((k) => !out[k]);
  if (missing.length) throw new HttpError(400, "Please fill in all the required delivery details.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(out.email)) throw new HttpError(400, "That email address doesn't look right.");
  if (!/^\+?[0-9 ()\-]{7,20}$/.test(out.phone) || out.phone.replace(/\D/g, "").length < 7) throw new HttpError(400, "Please enter a phone number the courier can reach you on.");
  return out;
}

const newReference = () => "DH-" + Date.now().toString(36).toUpperCase() + "-" + crypto.randomBytes(3).toString("hex").toUpperCase();
const validReference = (ref) => typeof ref === "string" && /^DH-[A-Z0-9]+-[A-F0-9]{6}$/.test(ref);

// Called once payment is confirmed: by Paystack's webhook, or by the thank-you
// page checking in. It re-checks the payment with Paystack itself rather than
// trusting whoever called. Gelato has no idempotency key, so only the webhook
// creates orders straight away; the thank-you page waits 90 seconds after
// payment before stepping in, so the two never race to create the same order.
async function placeOrder(reference, siteBase, { fromWebhook = false } = {}) {
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
  const thickness = o.thickness || THICKNESSES[0];
  const file = piece && printFiles.resolve(o.slug, siteBase);
  const productUid = piece && size && productUidFor(piece, size, thickness, o.frame);
  if (!piece || !size || !file || !productUid) {
    console.error("[ORDER FLAGGED] cannot print (unknown painting/size/file/product)", reference, o.slug, o.size, thickness);
    return { state: "flagged", reason: "cannot-print" };
  }
  if (!fromWebhook) {
    const existing = await gelato.findOrderByReference(reference);
    if (existing) return { state: "placed", gelatoOrderId: existing.id, outcome: "AlreadyExists" };
    const paidAt = Date.parse(tx.paid_at || tx.paidAt || "");
    if (paidAt && Date.now() - paidAt < 90 * 1000) return { state: "processing" };
  }
  const placed = await gelato.createOrder({
    reference, recipient: o.recipient, productUid, fileUrl: file.url, shipmentMethodUid: o.shipmentMethodUid, shippingType: o.shipping === "express" ? "express" : "normal",
  });
  console.log("[ORDER PLACED]", reference, "->", placed.id, placed.outcome, gelato.isLive() ? "(live)" : "(draft: not printed)");
  // First time this order reaches the printer: email the buyer a confirmation and tell Dennis.
  if (placed.outcome === "Created") {
    const country = catalog.countries.find((c) => c.code === o.recipient.country);
    const wide = orientationOf(piece) === "landscape";
    try {
      await orderEmails({
        reference, title: piece.title, sizeId: size.id, totalZAR: Number(tx.amount) / 100, recipient: o.recipient, siteBase,
        countryName: country && country.name, w: wide ? size.h : size.w, h: wide ? size.w : size.h, thickness, frame: o.frame,
        delivery: o.shipping === "express" ? "Express" : "Standard",
      });
    } catch (e) { console.error("[EMAIL] skipped", reference, e && e.message); }
  }
  return { state: "placed", gelatoOrderId: placed.id, outcome: placed.outcome, lowRes: file.lowRes };
}

module.exports = { price, cleanRecipient, newReference, validReference, placeOrder, COUNTRIES };
