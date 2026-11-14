// Order emails, sent through EmailJS (the same account as the contact forms),
// so they come from Dennis's own mailbox.
//
// Two messages go out the first time an order is placed with the printer:
//   1. a confirmation to the buyer   (template EMAILJS_ORDER_TEMPLATE)
//   2. a "new order" note to Dennis  (template EMAILJS_NOTIFY_TEMPLATE, the contact-form one)
//
// Email is a courtesy, never a reason to fail an order: every problem here is
// logged and swallowed. If the settings below are missing, nothing is sent.
//
// Settings: EMAILJS_SERVICE_ID, EMAILJS_PUBLIC_KEY (public, in wrangler.toml),
// EMAILJS_PRIVATE_KEY (secret, Cloudflare dashboard) and the two template ids.

const money = (n) => "R " + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

async function send(templateId, params) {
  const service = process.env.EMAILJS_SERVICE_ID, pub = process.env.EMAILJS_PUBLIC_KEY, priv = process.env.EMAILJS_PRIVATE_KEY;
  if (!service || !pub || !priv || !templateId) return { sent: false, reason: "not-configured" };
  const r = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ service_id: service, template_id: templateId, user_id: pub, accessToken: priv, template_params: params }),
  });
  if (!r.ok) throw new Error(`EmailJS ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return { sent: true };
}

// details: { reference, title, sizeId, w, h, thickness, delivery, totalZAR, recipient, siteBase }
async function orderEmails(d) {
  const r = d.recipient;
  const address = [r.line1, r.line2, r.city, r.state, r.postcode, d.countryName || r.country].filter(Boolean).join(", ");
  const kind = d.thickness === "framed" ? `framed print${d.frame ? ", " + String(d.frame).replace("-", " ") + " frame" : ""}` : d.thickness ? `${d.thickness} canvas` : "";
  const size = `${d.w} x ${d.h} in (${Math.round(d.w * 2.54)} x ${Math.round(d.h * 2.54)} cm)` + (kind ? `, ${kind}` : "") + (d.delivery ? `, ${d.delivery.toLowerCase()} delivery` : "");
  const out = {};
  try {
    out.customer = await send(process.env.EMAILJS_ORDER_TEMPLATE, {
      to_email: r.email, to_name: r.name, order_ref: d.reference, painting: d.title, size, total: money(d.totalZAR),
      address, policies_url: `${d.siteBase}/policies`, status_url: `${d.siteBase}/?order=${d.reference}`,
    });
  } catch (e) { console.error("[EMAIL] customer confirmation failed", d.reference, e.message); out.customer = { sent: false, reason: "error" }; }
  try {
    out.owner = await send(process.env.EMAILJS_NOTIFY_TEMPLATE, {
      name: r.name, email: r.email, subject: `New print order ${d.reference}`,
      time: new Date().toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg" }),
      message: `[New print order ${d.reference}]\n\n${d.title}, ${size}\nPaid: ${money(d.totalZAR)}\nShip to: ${r.name}, ${address}\nPhone: ${r.phone || "-"}`,
    });
  } catch (e) { console.error("[EMAIL] owner notification failed", d.reference, e.message); out.owner = { sent: false, reason: "error" }; }
  return out;
}

module.exports = { orderEmails };
