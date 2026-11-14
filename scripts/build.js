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
// robots.txt and a sitemap with every painting's image, so Google can find and index the paintings
// (the gallery is drawn by JavaScript, so the image sitemap is how search engines see each one).
const SITE = "https://dennishammerschlagart.com";
const xml = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const m = html.match(/const pieces = (\[[\s\S]*?\n\s*\]);/);
const pieces = m ? JSON.parse(m[1]) : [];
const today = new Date().toISOString().slice(0, 10);
const images = pieces.map((p) => `    <image:image><image:loc>${SITE}/${xml(p.img)}</image:loc><image:title>${xml(p.title)}</image:title>` +
  (p.desc ? `<image:caption>${xml(p.desc)}</image:caption>` : "") + `</image:image>`).join("\n");
fs.writeFileSync(path.join(out, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>${SITE}/</loc>
    <lastmod>${today}</lastmod>
${images}
  </url>
  <url>
    <loc>${SITE}/policies</loc>
    <lastmod>${today}</lastmod>
  </url>
</urlset>
`);
fs.writeFileSync(path.join(out, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE}/sitemap.xml\n`);
console.log("Built dist/:", fs.readdirSync(out).join(", "));
