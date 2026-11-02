// Paystack payments. Amounts are always in the smallest unit (cents for ZAR).
const { HttpError } = require("./http");

async function call(method, path, body) {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not set");
  const r = await fetch("https://api.paystack.co" + path, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await r.json().catch(() => null);
  if (!r.ok || !json || json.status === false) {
    throw new HttpError(502, `Paystack ${method} ${path} failed (${r.status})`, json);
  }
  return json.data;
}

const initialize = (payload) => call("POST", "/transaction/initialize", payload);
const verify = (reference) => call("GET", `/transaction/verify/${encodeURIComponent(reference)}`);

module.exports = { initialize, verify };
