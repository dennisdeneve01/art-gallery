// Copies the public website (and only that) into dist/ for Cloudflare Pages,
// so the shop's code and price files are not served as downloadable files.
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const out = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, "dist"); // optional: node scripts/build.js <folder>
try { fs.rmSync(out, { recursive: true, force: true }); } catch (e) { /* locked folder: files are simply overwritten below */ }
fs.mkdirSync(out, { recursive: true });
for (const item of ["index.html", "images", "favicon.svg", "favicon.ico", "robots.txt", "sitemap.xml"]) {
  const from = path.join(root, item);
  if (fs.existsSync(from)) fs.cpSync(from, path.join(out, item), { recursive: true });
}
// The policies page lists live prices and countries, so it can never disagree with the shop.
const catalog = require("../shop/catalog.json");
const rand = (n) => "R\u00a0" + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
const cmOf = (s) => s.cm || [Math.round(s.w * 2.54), Math.round(s.h * 2.54)];
const cell = (n) => `<td class="num">${n ? rand(n) : "&ndash;"}</td>`;
const rows = catalog.sizes.map((s) => `<tr><td>${s.w} \u00d7 ${s.h}</td><td>${cmOf(s)[0]} \u00d7 ${cmOf(s)[1]}</td>${cell((s.prices || {}).slim || s.price)}${cell((s.prices || {}).thick)}${cell((s.prices || {}).framed)}</tr>`).join("");
const names = catalog.countries.map((c) => c.name);
const countries = "I currently deliver to " + names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
const page = fs.readFileSync(path.join(root, "policies.html"), "utf8").replace("<!--PRICES-->", rows).replace("<!--COUNTRIES-->", countries);
fs.writeFileSync(path.join(out, "policies.html"), page);
console.log("Built dist/:", fs.readdirSync(out).join(", "));
