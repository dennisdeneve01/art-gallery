// Lets the shop's existing Node-style handlers (api/*.js, written as (req, res))
// run on Cloudflare Pages Functions, which speak the standard Request/Response API.
// The shop logic itself is untouched, so the same code and tests cover both.

export function run(handler) {
  return async ({ request, env }) => {
    // Cloudflare hands us settings in `env`; the shop code reads process.env.
    if (typeof process !== "undefined" && process.env && env) {
      for (const [k, v] of Object.entries(env)) if (typeof v === "string") process.env[k] = v;
    }

    const url = new URL(request.url);
    const headers = {};
    request.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
    headers.host = url.host;
    headers["x-forwarded-proto"] = url.protocol.replace(":", "");

    let body, rawBody;
    if (request.method !== "GET" && request.method !== "HEAD") {
      rawBody = await request.text();
      if (rawBody) { try { body = JSON.parse(rawBody); } catch (e) { body = undefined; } }
    }

    const req = {
      method: request.method,
      url: url.pathname + url.search,
      headers,
      query: Object.fromEntries(url.searchParams),
      body,
      rawBody,
    };

    return await new Promise((resolve) => {
      const out = new Headers();
      const res = {
        statusCode: 200,
        setHeader: (k, v) => out.set(k, String(v)),
        end: (chunk) => resolve(new Response(chunk == null ? null : chunk, { status: res.statusCode, headers: out })),
      };
      Promise.resolve(handler(req, res)).then(
        () => resolve(new Response(null, { status: 204 })), // handler finished without answering
        (err) => {
          console.error("[adapter error]", err && err.stack ? err.stack : err);
          resolve(new Response(JSON.stringify({ error: "Something went wrong on our side. Please try again in a moment." }), { status: 500, headers: { "Content-Type": "application/json" } }));
        }
      );
    });
  };
}
