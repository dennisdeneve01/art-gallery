// Shared by the tests: pretend product codes for every size, so nothing needs Gelato.
const { catalog, _setGelatoProducts } = require("../api/_lib/catalog");
const map = {};
for (const s of catalog.sizes) {
  map[s.id] = { slim: { ver: `canvas_${s.id}_slim_ver`, hor: `canvas_${s.id}_slim_hor` }, thick: { ver: `canvas_${s.id}_thick_ver`, hor: `canvas_${s.id}_thick_hor` } };
  if (s.prices.framed) map[s.id].framed = Object.fromEntries(["black", "white", "wood", "dark-wood"].map((f) => [f, { ver: `framed_${s.id}_${f}_ver`, hor: `framed_${s.id}_${f}_hor` }]));
}
_setGelatoProducts(map);
module.exports = map;
