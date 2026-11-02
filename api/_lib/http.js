// Tiny helpers shared by the API functions. No dependencies.

class HttpError extends Error {
  constructor(status, message, detail) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

// Wraps a handler so thrown errors become tidy JSON responses.
function handler(methods, fn) {
  return async (req, res) => {
    try {
      if (!methods.includes(req.method)) {
        res.setHeader("Allow", methods.join(", "));
        return send(res, 405, { error: "Method not allowed" });
      }
      await fn(req, res);
    } catch (err) {
      if (err instanceof HttpError && err.status < 500) {
        return send(res, err.status, { error: err.message });
      }
      console.error("[api error]", req.url, err && err.stack ? err.stack : err, err && err.detail ? JSON.stringify(err.detail) : "");
      return send(res, 500, { error: "Something went wrong on our side. Please try again in a moment." });
    }
  };
}

function siteUrl(req) {
  const fromEnv = (process.env.SITE_URL || "").trim().replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  const proto = (req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = (req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  return `${proto}://${host}`;
}

module.exports = { HttpError, send, handler, siteUrl };
