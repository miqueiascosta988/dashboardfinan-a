// E-mail de segunda-feira: o Plano da semana do cliente (vem do mesmo motor do app: public/weekplan.js).
const SLOGAN = 'Do aperto ao plano, do plano ao alívio.';
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = (v) => 'R$ ' + Math.round(+v || 0).toLocaleString('pt-BR');
const br = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);
const months = (n) => (n >= 24 ? 'cerca de ' + String(Math.round(n / 12 * 10) / 10).replace('.', ',') + ' anos' : n === 1 ? '1 mês' : n + ' meses');

function buildWeekEmail({ name, plan, appUrl, unsubUrl }) {
  const first = String(name || '').trim().split(/\s+/)[0];
  const hi = first ? 'Olá, ' + first + '!' : 'Olá!';
  const f = plan.freedom;
  const freeTxt = f ? (f.months != null ? 'No ritmo atual, faltam ' + months(f.months) + ' para quitar ' + brl(f.total) + ' em dívidas.' : 'A parcela de "' + f.stuck[0] + '" não cobre nem os juros. Negocie ou aumente o pagamento para a dívida começar a cair.') : '';
  const pay = plan.payables.slice(0, 5).map((x) => x.title + ' ' + brl(x.amount) + ' (' + (x.late ? 'venceu ' : '') + br(x.dueDate) + ')');
  const subject = plan.missions.length ? 'Seu plano da semana: ' + plan.missions.length + (plan.missions.length === 1 ? ' missão' : ' missões') : 'Seu plano da semana no SM Financial';
  const text = [hi, '', 'Este é o seu plano da semana (' + br(plan.start) + ' a ' + br(plan.end) + '), montado com base nos seus números:', '',
    ...plan.missions.map((m, i) => (i + 1) + '. ' + m.title + '\n   ' + m.why), '', freeTxt, pay.length ? 'Vencimentos até domingo: ' + pay.join(' | ') : '', '',
    'Abrir meu plano: ' + appUrl, '', SLOGAN, '', 'Para parar de receber este e-mail: ' + unsubUrl].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
  const li = plan.missions.map((m) => '<li style="margin:0 0 14px"><b>' + esc(m.icon + ' ' + m.title) + '</b><br><span style="color:#4A5668;font-size:14px">' + esc(m.why) + '</span></li>').join('');
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#101B2D;line-height:1.55">'
    + '<h2 style="color:#16324F;margin:0 0 8px">Seu plano da semana</h2><p style="margin:0 0 14px">' + esc(hi) + ' Estas são as missões de ' + br(plan.start) + ' a ' + br(plan.end) + ', escolhidas com base nos seus números.</p>'
    + (freeTxt ? '<p style="background:#FBF1D6;padding:12px 14px;border-radius:10px;margin:0 0 16px">⏳ ' + esc(freeTxt) + '</p>' : '')
    + '<ol style="padding-left:20px;margin:0 0 16px">' + li + '</ol>'
    + (pay.length ? '<p style="font-size:14px;color:#4A5668"><b>Vencimentos até domingo:</b> ' + esc(pay.join(' · ')) + '</p>' : '')
    + '<p><a href="' + esc(appUrl) + '" style="display:inline-block;background:#16324F;color:#fff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:10px">Abrir meu plano</a></p>'
    + '<p style="margin-top:22px;font-size:13px;color:#8A94A6;border-top:1px solid #E3E8EF;padding-top:12px"><i>' + esc(SLOGAN) + '</i><br><a href="' + esc(unsubUrl) + '" style="color:#8A94A6">Parar de receber este e-mail</a></p></div>';
  return { subject, text, html };
}
module.exports = { buildWeekEmail };
