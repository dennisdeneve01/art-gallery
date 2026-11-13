// Reads shop/catalog.json (sizes + prices + the list of paintings) and works
// out which sizes suit which painting. Shared by every API function, so the
// server — not the browser — is always the one deciding what costs what.

const catalog = require("../../shop/catalog.json");

const sizes = catalog.sizes;
const sizeById = (id) => sizes.find((s) => s.id === id);

// How much of one side would be trimmed if the painting were printed edge to
// edge on a canvas of this shape (0 = perfect fit).
function cropFor(piece, size) {
  const rp = Math.min(piece.w, piece.h) / Math.max(piece.w, piece.h);
  const rs = size.w / size.h; // sizes are stored short x long
  return 1 - Math.min(rp, rs) / Math.max(rp, rs);
}

function orientationOf(piece) {
  const r = piece.w / piece.h;
  if (Math.abs(r - 1) < 0.02) return "square";
  return r > 1 ? "landscape" : "portrait";
}

// Sizes offered for a painting: the ones that fit its shape best, as long as
// no more than `maxCrop` of the picture would be trimmed. A piece can pin its
// own list with "sizes": ["12x16", ...] in catalog.json.
function sizesFor(piece) {
  if (!piece || piece.forSale === false) return [];
  if (Array.isArray(piece.sizes) && piece.sizes.length) {
    return piece.sizes.map(sizeById).filter(Boolean).map((s) => ({ size: s, crop: cropFor(piece, s) }));
  }
  const scored = sizes.map((s) => ({ size: s, crop: cropFor(piece, s) })).filter((x) => x.crop <= catalog.maxCrop);
  if (!scored.length) return [];
  const best = Math.min(...scored.map((x) => x.crop));
  return scored.filter((x) => x.crop <= best + 0.03).sort((a, b) => a.size.price - b.size.price);
}

// Gelato's product code for a size, thickness and orientation, from shop/gelato-products.json
// (written by `npm run gelato-products`). Square canvases use the vertical code.
let gelatoProducts = {};
try { gelatoProducts = require("../../shop/gelato-products.json").sizes || {}; } catch (e) { gelatoProducts = {}; }
const THICKNESSES = (catalog.thicknesses || [{ id: "slim" }]).map((t) => t.id);
// Framed prints add a frame colour level: sizes[id].framed[frame][orientation].
const kindOf = (id) => (catalog.thicknesses || []).find((t) => t.id === id) || null;
const framesOf = (id) => ((kindOf(id) || {}).frames || []).map((f) => f.id);
function productUidFor(piece, size, thickness, frame) {
  let node = gelatoProducts[size.id] && gelatoProducts[size.id][thickness];
  if (!node) return null;
  const frames = framesOf(thickness);
  if (frames.length) node = node[frames.includes(frame) ? frame : frames[0]];
  if (!node) return null;
  const o = orientationOf(piece) === "landscape" ? "hor" : "ver";
  return node[o] || node.ver || node.hor || null;
}
// Can this size be ordered in this option at all (any frame colour)?
function offered(piece, size, thickness) {
  const frames = framesOf(thickness);
  return frames.length ? frames.some((f) => productUidFor(piece, size, thickness, f)) : !!productUidFor(piece, size, thickness);
}
const priceOf = (size, thickness) => (size.prices && size.prices[thickness]) || null;

// Tests swap in their own product codes.
const _setGelatoProducts = (map) => { gelatoProducts = map || {}; };

module.exports = { catalog, sizes, sizeById, sizesFor, productUidFor, offered, framesOf, priceOf, THICKNESSES, cropFor, orientationOf, _setGelatoProducts };
