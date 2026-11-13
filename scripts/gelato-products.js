// Run `npm run gelato-products` (after putting GELATO_API_KEY in .env).
//
// Looks up Gelato's product code for every size in shop/catalog.json:
//   - canvas: slim and thick, both orientations (catalogue GELATO_CANVAS_CATALOG, default "canvas")
//   - framed print: premium matte paper, ready to hang, each frame colour, both orientations
//     (catalogue GELATO_POSTER_CATALOG; found automatically if not set)
// and saves them to shop/gelato-products.json. The shop only sells what has a code.
//
// Add a country to also price sample deliveries there and see where each is printed:
//   npm run gelato-products -- ZA
const fs = require("fs");
const path = require("path");
const gelato = require("../api/_lib/gelato");
const { catalog } = require("../api/_lib/catalog");

const out = path.join(__dirname, "..", "shop", "gelato-products.json");
const quoteCountry = (process.argv[2] || "").toUpperCase();
const lower = (x) => String(x == null ? "" : x).toLowerCase();
const mmOf = (d) => (d && d.value != null ? Number(d.value) * ({ cm: 10, m: 1000, in: 25.4, inch: 25.4 }[lower(d.measureUnit)] || 1) : null);
const kinds = catalog.thicknesses || [];
const framed = kinds.find((k) => (k.frames || []).length);

// Size (mm), orientation, thickness and frame colour of one Gelato product.
function describe(p) {
  const uid = lower(p.productUid);
  const attrs = Object.values(p.attributes || {}).map(lower).join(" ");
  const text = uid + " " + attrs;
  let w, h;
  const m = uid.match(/(\d{2,4})x(\d{2,4})-mm/); // the first size in the code is the print size
  if (m) { w = Number(m[1]); h = Number(m[2]); }
  if (!(w && h)) { w = mmOf(p.dimensions && p.dimensions.Width); h = mmOf(p.dimensions && p.dimensions.Height); }
  if (!(w && h)) return null;
  const orient = /_hor$|(^|[^a-z])hor([^a-z]|$)|horizontal/.test(text) ? "hor" : /_ver$|(^|[^a-z])ver([^a-z]|$)|vertical/.test(text) ? "ver" : null;
  const thickness = /thick/.test(text) ? "thick" : /slim/.test(text) ? "slim" : null;
  const colour = /(^|_)white_/.test(uid) ? "white" : /(^|_)black_/.test(uid) ? "black" : /dark|brown/.test(uid) ? "dark-wood" : /natural|_wood_wood|(^|_)wood_/.test(uid) ? "wood" : null;
  return {
    uid: p.productUid, cm: [Math.round(Math.min(w, h) / 10), Math.round(Math.max(w, h) / 10)], orient, thickness, colour,
    inactive: /deactivated|discontinued|inactive/.test(attrs),
    mounted: /mounted/.test(uid), premium: /200-gsm-80lb-uncoated/.test(uid), extra: /hanger|rolled/.test(uid) ? 1 : 0, // premium matte = 200 gsm uncoated
  };
}

async function allProducts(catalogUid) {
  const products = [];
  for (let offset = 0; offset < 10000; offset += 100) {
    const page = await gelato.searchProducts(catalogUid, { attributeFilters: {}, limit: 100, offset });
    const list = page.products || [];
    products.push(...list);
    if (list.length < 100) break;
  }
  return products;
}

async function catalogUids() {
  try { const c = await gelato.listCatalogs(); return (c.data || c.catalogs || c || []).map((x) => ({ uid: x.catalogUid || x.uid, title: x.title || "" })); }
  catch (e) { return []; }
}

const wantCm = (s) => { const [a, b] = s.cm || [Math.round(s.w * 2.54), Math.round(s.h * 2.54)]; return [Math.min(a, b), Math.max(a, b)]; };
const pickBest = (hits, prefer) => hits.sort(prefer || ((x, y) => x.extra - y.extra || x.uid.length - y.uid.length))[0];

(async () => {
  console.log(`Gelato | mode ${gelato.isLive() ? "LIVE" : "draft (test)"}\n`);
  const all = await catalogUids();
  const result = { _readme: "Filled in by `npm run gelato-products`. sizes[id][option][frame?][orientation] = Gelato product code.", sizes: {} };
  for (const s of catalog.sizes) result.sizes[s.id] = {};
  const rows = [];

  const alternatives = {};
  // ---- canvas ----
  const canvasUid = process.env.GELATO_CANVAS_CATALOG || "canvas";
  let canvas = [];
  try { canvas = (await allProducts(canvasUid)).map(describe).filter((d) => d && !d.inactive); }
  catch (e) { console.error(`Couldn't read the "${canvasUid}" catalogue: ${e.message}`); }
  console.log(`Canvas catalogue "${canvasUid}": ${canvas.length} products`);
  for (const s of catalog.sizes) for (const t of kinds.filter((k) => !(k.frames || []).length).map((k) => k.id)) for (const o of ["ver", "hor"]) {
    const want = wantCm(s);
    const hits = canvas.filter((d) => d.cm[0] === want[0] && d.cm[1] === want[1] && d.thickness === t && (d.orient === o || (want[0] === want[1] && !d.orient)));
    const best = pickBest(hits);
    if (best) (result.sizes[s.id][t] = result.sizes[s.id][t] || {})[o] = best.uid;
    if (s.id === "12x16" && o === "ver") alternatives[t] = hits.map((h) => h.uid);
    if (s.prices && s.prices[t]) rows.push([s.id, t, "", o, best ? best.uid : "-- NOT FOUND --", hits.length - 1]);
  }

  // ---- framed prints (premium matte, ready to hang) ----
  if (framed) {
    // Ready-to-hang wooden framed posters live in "mounted-framed-posters" (codes start framed_poster_mounted_);
    // "framed-posters" is the not-assembled version. Read both and prefer the mounted ones.
    const posterUids = (process.env.GELATO_POSTER_CATALOG || "mounted-framed-posters,framed-posters").split(",").map((x) => x.trim()).filter(Boolean);
    let posters = [];
    for (const uid of posterUids) {
      try {
        const found = (await allProducts(uid)).map(describe).filter((d) => d && !d.inactive && d.premium);
        console.log(`Framed poster catalogue "${uid}": ${found.length} premium matte products (${found.filter((d) => d.mounted).length} ready to hang)`);
        posters.push(...found);
      } catch (e) { console.error(`Couldn't read the "${uid}" catalogue: ${e.message}`); }
    }
    const posterUid = posterUids.join(", ");
    for (const s of catalog.sizes) {
      if (!(s.prices && s.prices[framed.id])) continue;
      for (const f of framed.frames.map((x) => x.id)) for (const o of ["ver", "hor"]) {
        const want = wantCm(s);
        const hits = posters.filter((d) => d.cm[0] === want[0] && d.cm[1] === want[1] && d.colour === f && (d.orient === o || (want[0] === want[1] && !d.orient)));
        const best = pickBest(hits, (x, y) => (y.mounted - x.mounted) || x.extra - y.extra || x.uid.length - y.uid.length);
        if (best) ((result.sizes[s.id][framed.id] = result.sizes[s.id][framed.id] || {})[f] = result.sizes[s.id][framed.id][f] || {})[o] = best.uid;
        rows.push([s.id, framed.id, f, o, best ? best.uid + (best.mounted ? "" : "   (NOT ready-to-hang)") : "-- NOT FOUND --", hits.length - 1]);
      }
    }
    if (!posters.length && all.length) console.log("Catalogues on this account:\n" + all.map((c) => `  - ${c.uid}  ${c.title}`).join("\n") + "\nSet GELATO_POSTER_CATALOG=<uid> in .env and run again.");
  }

  console.log("");
  rows.forEach(([id, t, f, o, uid, more]) => console.log(`${id.padEnd(6)} ${t.padEnd(7)} ${(f || "").padEnd(10)} ${o}  ${uid}${more > 0 ? `   (+${more} similar)` : ""}`));
  fs.writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
  const missing = rows.filter((r) => r[4].startsWith("--")).length;
  console.log(`\nSaved shop/gelato-products.json. ${missing ? missing + " combination(s) not found: send Claude this output." : "Every option has a product code."}`);

  if (quoteCountry) {
    console.log(`\nSample delivery to ${quoteCountry} (prices in ${process.env.GELATO_CURRENCY || "EUR"}):`);
    const sample = { name: "Test Buyer", email: "test@example.com", phone: "0820000000", line1: "1 Long Street", city: quoteCountry === "ZA" ? "Cape Town" : "London", state: quoteCountry === "ZA" ? "Western Cape" : undefined, postcode: quoteCountry === "ZA" ? "8001" : "EC1A 1BB", country: quoteCountry };
    let shownQuote = false;
    // Every 12x16 vertical canvas variant, to see whether any is printed in the buyer's country.
    // A real image is attached, as some labs only quote for a product with a file.
    const fileUrl = "https://art-gallery.dennishammerschlag01.workers.dev/images/burnt-horizon.jpg";
    if (process.argv.includes("--variants")) {
      console.log("\n12x16 canvas variants (with an image attached):");
      for (const t of Object.keys(alternatives)) for (const uid of alternatives[t]) {
        try {
          const q = await gelato.quote({ productUid: uid, recipient: sample, fileUrl });
          console.log(`  ${uid}\n      item ${q.itemCost}, standard ${q.standard ? q.standard.price + " (" + q.standard.minDays + "-" + q.standard.maxDays + " days, " + q.standard.name + ")" : "n/a"}, printed in ${q.fulfillmentCountry}`);
        } catch (e) { console.log(`  ${uid}: ${e.message}`); }
      }
    }
    const pickUid = (id, t) => { let n = result.sizes[id] && result.sizes[id][t]; if (n && !n.ver && !n.hor) n = Object.values(n)[0]; return n && (n.ver || n.hor); };
    for (const [id, t] of [["8x10", "slim"], ["12x16", "slim"], ["12x16", "thick"], ["24x36", "slim"], ["12x16", "framed"]]) {
      const uid = pickUid(id, t);
      if (!uid) continue;
      try {
        const q = await gelato.quote({ productUid: uid, recipient: sample });
        const d = (m) => (m ? `${m.price} (${m.minDays}-${m.maxDays} days, ${m.name}${m.incoTerms ? ", " + m.incoTerms : ""})` : "n/a");
        console.log(`  ${id.padEnd(6)} ${t.padEnd(7)} item ${q.itemCost}, standard ${d(q.standard)}, express ${d(q.express)}, printed in ${q.fulfillmentCountry || "?"}`);
      } catch (e) {
        console.log(`  ${id} ${t}: quote failed - ${e.message}`);
        if (!shownQuote && e.detail && e.detail.quotes) {
          shownQuote = true;
          const q0 = Object.assign({}, e.detail.quotes[0]); delete q0.products;
          console.log("  Gelato's answer (send this to Claude):\n" + JSON.stringify(q0, null, 2).slice(0, 3000));
        } else if (!shownQuote) console.log("  " + JSON.stringify(e.detail || "").slice(0, 1500));
      }
    }
  }
})().catch((e) => { console.error(e.message, JSON.stringify(e.detail || "").slice(0, 600)); process.exit(1); });
