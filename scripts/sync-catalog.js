// Copies the list of paintings from index.html into shop/catalog.json so the
// server knows each painting's shape. Run `npm run sync-catalog` whenever you
// add or remove a painting. Anything you set by hand (forSale, sizes) is kept.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const m = html.match(/const pieces = (\[[\s\S]*?\n\s*\]);/);
if (!m) throw new Error("Couldn't find the pieces array in index.html");
const pieces = JSON.parse(m[1]);

const file = path.join(root, "shop", "catalog.json");
const catalog = JSON.parse(fs.readFileSync(file, "utf8"));
const old = catalog.pieces || {};
const next = {};
const notes = [];
for (const p of pieces) {
  const slug = p.img.replace(/^.*\//, "").replace(/\.[a-z]+$/i, "");
  const prev = old[slug] || {};
  const entry = { title: p.title, w: p.w, h: p.h };
  if (prev.sizes) entry.sizes = prev.sizes;
  // Studies "after" living-copyright artists are held back until you decide.
  if (prev.forSale !== undefined) entry.forSale = prev.forSale;
  else if (/picasso/i.test(p.credit || "")) { entry.forSale = false; notes.push(`${p.title}: left OFF sale (after Picasso, whose work is still under copyright). Set forSale to true if you've taken advice and want it on.`); }
  next[slug] = entry;
}
catalog.pieces = next;
fs.writeFileSync(file, JSON.stringify(catalog, null, 2).replace(/"pieces": \{[\s\S]*\n  \}\n\}$/, (s) => s) + "\n");
console.log(`Synced ${pieces.length} paintings.`);
notes.forEach((n) => console.log("Note - " + n));
