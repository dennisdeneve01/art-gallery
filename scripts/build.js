// Copies the public website (and only that) into dist/ for Cloudflare Pages,
// so the shop's code and price files are not served as downloadable files.
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const out = path.join(root, "dist");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const item of ["index.html", "images", "favicon.ico", "robots.txt", "sitemap.xml"]) {
  const from = path.join(root, item);
  if (fs.existsSync(from)) fs.cpSync(from, path.join(out, item), { recursive: true });
}
console.log("Built dist/:", fs.readdirSync(out).join(", "));
