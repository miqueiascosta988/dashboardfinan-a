// Envio de e-mail pela Resend (API HTTP). Variáveis: RESEND_API_KEY, MAIL_FROM. Sem elas, nada é enviado.
async function sendMail({ to, subject, html, text, headers }, deps) {
  const env = process.env, f = (deps && deps.fetch) || fetch;
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) return { skipped: 'not_configured' };
  const r = await f('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, html, text, headers }),
  });
  if (!r.ok) throw new Error('Resend ' + r.status + ' ' + String(await r.text().catch(() => '')).slice(0, 200));
  return { sent: true };
}
module.exports = { sendMail };
