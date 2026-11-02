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

// Prodigi only lists one code per canvas size (shorter side first, e.g. 18X24);
// landscape codes like 24X18 do not exist (confirmed against the live catalogue).
function skuFor(piece, size) {
  const [short, long] = [Math.min(size.w, size.h), Math.max(size.w, size.h)];
  return `${catalog.skuPrefix}-${short}X${long}`;
}

module.exports = { catalog, sizes, sizeById, sizesFor, skuFor, cropFor, orientationOf };
