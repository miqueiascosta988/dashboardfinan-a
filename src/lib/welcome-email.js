// E-mail automático de boas-vindas após a compra: link do dashboard + vídeo de onboarding.
// Envio via Resend (API HTTP, sem dependência extra). Variáveis de ambiente:
//   RESEND_API_KEY        chave da Resend (obrigatória; sem ela nada é enviado)
//   MAIL_FROM             remetente de um domínio verificado na Resend, ex.: "SM Financial <contato@seudominio.com.br>"
//   APP_URL               endereço do dashboard, ex.: https://seu-app.onrender.com
//   ONBOARDING_VIDEO_URL  link do vídeo de onboarding (YouTube não listado, Vimeo, Drive...)
const SLOGAN = 'Do aperto ao plano, do plano ao alívio.';
const PLAN_LABEL = { basic: 'Basic', plus: 'Plus', pro: 'Pro', business: 'Business' };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const httpsUrl = (u) => { try { const x = new URL(String(u || '').trim()); return x.protocol === 'https:' ? x.href : null; } catch (e) { return null; } };

function buildWelcome({ plan, appUrl, videoUrl, trial }) {
  const app = httpsUrl(appUrl), video = httpsUrl(videoUrl), nome = PLAN_LABEL[plan] || 'SM Financial';
  const subject = 'Seu acesso ao SM Financial está liberado';
  const intro = 'Sua compra do plano ' + nome + (trial ? ' (7 dias de acesso)' : '') + ' foi aprovada. Para entrar, use o MESMO e-mail da compra: se ainda não tem conta, é só criar o cadastro com ele que o plano é ativado automaticamente.';
  const text = ['Olá!', '', intro, '', app ? 'Acessar o dashboard: ' + app : '', video ? 'Vídeo de onboarding (explica o dashboard passo a passo): ' + video : '', '',
    'Dentro do app, o botão "Tutorial" no topo abre um passeio com setas e balões por todas as áreas.', '', 'Qualquer dúvida, é só responder este e-mail.', '', SLOGAN].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
  const btn = (href, label, bg) => '<a href="' + esc(href) + '" style="display:inline-block;background:' + bg + ';color:#fff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:10px;margin:6px 6px 6px 0">' + esc(label) + '</a>';
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#101B2D;line-height:1.55">'
    + '<h2 style="color:#16324F;margin:0 0 12px">Seu acesso está liberado</h2><p>Olá!</p><p>' + esc(intro) + '</p>'
    + '<p>' + (app ? btn(app, 'Acessar o dashboard', '#16324F') : '') + (video ? btn(video, 'Assistir ao vídeo de onboarding', '#AD8A2A') : '') + '</p>'
    + (video ? '<p style="font-size:14px;color:#4A5668">O vídeo explica o dashboard passo a passo. Se alguma explicação do tutorial dentro do app não ficar clara, é nele que você tira a dúvida.</p>' : '')
    + '<p style="font-size:14px;color:#4A5668">Dentro do app, o botão <b>Tutorial</b> no topo abre um passeio com setas e balões por todas as áreas.</p>'
    + '<p style="font-size:14px;color:#4A5668">Qualquer dúvida, é só responder este e-mail.</p>'
    + '<p style="margin-top:22px;font-size:13px;color:#8A94A6;border-top:1px solid #E3E8EF;padding-top:12px"><i>' + esc(SLOGAN) + '</i></p></div>';
  return { subject, text, html };
}

// Retorna { sent:true } | { skipped:motivo }. Lança erro se a Resend recusar (quem chama decide o que fazer).
async function sendWelcomeEmail({ to, plan, trial }, deps) {
  const env = process.env, f = (deps && deps.fetch) || fetch;
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) return { skipped: 'not_configured' };
  const appUrl = env.APP_URL, videoUrl = env.ONBOARDING_VIDEO_URL;
  if (!httpsUrl(appUrl)) return { skipped: 'no_app_url' };
  const m = buildWelcome({ plan, appUrl, videoUrl, trial });
  const r = await f('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject: m.subject, html: m.html, text: m.text }),
  });
  if (!r.ok) throw new Error('Resend ' + r.status + ' ' + String(await r.text().catch(() => '')).slice(0, 200));
  return { sent: true };
}
module.exports = { sendWelcomeEmail, buildWelcome, httpsUrl };
