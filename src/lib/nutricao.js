// Sequência de acolhimento por e-mail (3 mensagens) para quem fez a triagem e pediu para receber. Contas e textos puros.
const SLOGAN = 'Do aperto ao plano, do plano ao alívio.';
const DIAS = [0, 2, 5];   // dias depois da inscrição em que cada e-mail sai
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const validEmail = (e) => typeof e === 'string' && e.length <= 160 && /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/.test(e);
// Próximo e-mail devido (1, 2 ou 3) ou null.
function dueStep(row, now) {
  if (!row || row.opt_out || row.converted) return null;
  const s = +row.step || 0; if (s >= DIAS.length) return null;
  const age = (now - Date.parse(row.created_at)) / 86400000;
  return age >= DIAS[s] ? s + 1 : null;
}
const TEXTOS = {
  1: { subject: 'Que bom que você começou a se cuidar', corpo: ['Obrigado por responder à nossa triagem. Dar o primeiro passo para olhar o próprio dinheiro de frente exige coragem, e a gente sabe que nem sempre é fácil.', 'Você não está sozinho nisso. Muita gente chega aqui cansada de fechar o mês no aperto, e o caminho começa do mesmo jeito: colocar tudo em um lugar só, sem julgamento.', 'Nos próximos dias vamos te escrever mais duas vezes, com calma. Se preferir não receber, é só usar o link no fim deste e-mail.'], cta: 'Conhecer o SM Financial' },
  2: { subject: 'Um passo pequeno para esta semana', corpo: ['Um mês de cada vez. Se hoje o dinheiro está curto, comece por uma única coisa: anote tudo o que entrou e o que saiu nos últimos sete dias.', 'Não precisa ser perfeito. Só de enxergar os números, a sensação de aperto costuma diminuir, porque o que a gente enxerga dá para resolver.', 'Quando quiser companhia nesse caminho, estamos aqui.'], cta: 'Ver como podemos te ajudar' },
  3: { subject: 'Seguimos aqui quando você quiser', corpo: ['Este é o último e-mail da sequência. Não vamos insistir: cada pessoa tem o seu tempo.', 'Se em algum momento você quiser transformar o aperto em um plano, a porta continua aberta, e o primeiro passo pode ser grátis.', 'Cuide-se, e cuide de quem depende de você.'], cta: 'Começar no meu tempo' },
};
function buildNutricao(step, { appUrl, unsubUrl, apresUrl }) {
  const t = TEXTOS[step]; if (!t) return null;
  const text = ['Olá!', '', ...t.corpo.flatMap((p) => [p, '']), t.cta + ': ' + apresUrl, '', SLOGAN, '', 'Você recebeu este e-mail porque pediu o resultado da triagem. Para não receber mais: ' + unsubUrl].join('\n');
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#101B2D;line-height:1.6"><h2 style="color:#16324F;margin:0 0 12px">' + esc(t.subject) + '</h2><p>Olá!</p>'
    + t.corpo.map((p) => '<p>' + esc(p) + '</p>').join('')
    + '<p><a href="' + esc(apresUrl) + '" style="display:inline-block;background:#16324F;color:#fff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:10px">' + esc(t.cta) + '</a></p>'
    + '<p style="margin-top:22px;font-size:13px;color:#8A94A6;border-top:1px solid #E3E8EF;padding-top:12px"><i>' + esc(SLOGAN) + '</i><br>Você recebeu este e-mail porque pediu o resultado da triagem. <a href="' + esc(unsubUrl) + '" style="color:#8A94A6">Não quero mais receber</a></p></div>';
  return { subject: t.subject, text, html };
}
module.exports = { DIAS, validEmail, dueStep, buildNutricao, SLOGAN };
