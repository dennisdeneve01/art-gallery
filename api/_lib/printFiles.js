// Where Prodigi downloads the print-quality file for each painting.
//
// Put the full-resolution image for each painting somewhere Prodigi can reach
// by a public link (see README), then list it in shop/print-files.json:
//     { "burnt-horizon": "https://example.com/hi-res/burnt-horizon.jpg" }
//
// In SANDBOX mode, paintings without an entry fall back to the 1400px web image
// so you can test the whole flow. In LIVE mode that fallback is switched off:
// a 1400px file would print blurry on a big canvas, so those paintings are
// simply not offered until you add a proper file.

let files = {};
try { files = require("../../shop/print-files.json"); } catch (e) { files = {}; }

const isLive = () => (process.env.PRODIGI_ENV || "sandbox").toLowerCase() === "live";

function slugOf(piece) {
  return piece.img.replace(/^.*\//, "").replace(/\.[a-z]+$/i, "");
}

// Returns { url, lowRes } or null if this painting can't be printed right now.
function resolve(slug, siteBase) {
  const hi = files[slug];
  if (typeof hi === "string" && /^https:\/\//.test(hi)) return { url: hi, lowRes: false };
  if (isLive()) return null;
  if (!siteBase) return null;
  return { url: `${siteBase}/images/${slug}.jpg`, lowRes: true };
}

module.exports = { resolve, slugOf, isLive };
