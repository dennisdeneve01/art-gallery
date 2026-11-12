// Cloudflare Worker entry: sends /api/* to the shop's handlers and serves
// everything else (the website and images) from the built dist/ folder.
import { run } from "../cf/adapter.mjs";
import catalog from "../api/catalog.js";
import quote from "../api/quote.js";
import checkout from "../api/checkout.js";
import webhook from "../api/webhook.js";
import order from "../api/order.js";

const routes = { "/api/catalog": catalog, "/api/quote": quote, "/api/checkout": checkout, "/api/webhook": webhook, "/api/order": order };

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname.replace(/\/+$/, "");
    const handler = routes[path];
    if (handler) return run(handler)({ request, env });
    if (path.startsWith("/api/")) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
    return env.ASSETS.fetch(request);
  },
};
