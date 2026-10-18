const express = require('express');
const router = express.Router();

const { createClient } = require('@supabase/supabase-js');

function getSupabaseAdmin() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// Mapeia o ID do produto cadastrado na Hotmart para o plano interno.
// Configure HOTMART_PRODUCT_BASIC, _PLUS, _PRO e _BUSINESS com o "Product ID" de cada produto
// (Hotmart > Produtos > seu produto > Detalhes). Produto desconhecido NÃO libera plano nenhum.
// Os 4 planos (e o semanal) são do MESMO produto na Hotmart, então o plano é identificado pelo NOME do plano
// que a Hotmart envia (data.subscription.plan.name). O Product ID só serve de reserva quando o nome não vem.
// 'semanal' = Basic de entrada (R$ 5/semana): vira acesso Basic de 7 dias renovado a cada pagamento semanal.
function resolvePlanFromName(name) {
  const n = String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (!n) return null;
  const weekly = /semanal/.test(n);
  for (const p of ['business', 'pro', 'plus', 'basic']) if (new RegExp('\\b' + p + '\\b').test(n)) return { plan: p, weekly: p === 'basic' && weekly };
  return null;
}
function planNameOf(data) {
  const d = data || {};
  // SWITCH_PLAN traz a lista de planos; o novo é o que está marcado como atual.
  const cur = Array.isArray(d.plans) ? d.plans.find((x) => x && x.current === true) : null;
  return (cur && (cur.name || (cur.plan && cur.plan.name))) || d.subscription?.plan?.name || d.plan?.name || d.purchase?.subscription?.plan?.name || null;
}
function resolvePlanFromProduct(productId) {
  const id = String(productId || '');
  const map = [['business', process.env.HOTMART_PRODUCT_BUSINESS], ['pro', process.env.HOTMART_PRODUCT_PRO],
    ['plus', process.env.HOTMART_PRODUCT_PLUS], ['basic', process.env.HOTMART_PRODUCT_BASIC]];
  for (const [plan, pid] of map) if (pid && id === String(pid)) return plan;
  return null;
}

// Produto de TESTE (Basic por R$ 5, acesso de 7 dias). Configure HOTMART_PRODUCT_TRIAL com o Product ID desse produto.
const TRIAL_DAYS = 7;
const isTrialProduct = (productId) => !!process.env.HOTMART_PRODUCT_TRIAL && String(productId || '') === String(process.env.HOTMART_PRODUCT_TRIAL);

// Escapa % _ \ para o e-mail do comprador não virar curinga no ilike.
const likeEscape = (v) => String(v).replace(/[\\%_]/g, (c) => '\\' + c);
const crypto = require('crypto');
const { sendWelcomeEmail } = require('../lib/welcome-email');
const { cleanStr } = require('../lib/crm');
// CRM: registra o comprador (e a campanha de origem, se o link trouxe src/sck). Nunca derruba o webhook.
async function crmRegistrarCompra(supabase, data, buyerEmail, plan, transactionId) {
  try {
    const origin = (data.purchase && data.purchase.origin) || {};
    const price = data.purchase && data.purchase.price && parseFloat(data.purchase.price.value);
    await supabase.from('crm_leads').upsert({ nome: cleanStr(data.buyer && data.buyer.name, 120), email: cleanStr(buyerEmail, 160), origem: 'hotmart', campanha: cleanStr(origin.src, 100), etapa: 'cliente', valor: isFinite(price) ? price : null, plano: plan, hotmart_tx: transactionId ? String(transactionId) : null, updated_at: new Date().toISOString() }, { onConflict: 'hotmart_tx' });
    if (origin.sck && /^[a-zA-Z0-9-]{8,40}$/.test(String(origin.sck))) await supabase.from('crm_events').insert({ visitor: String(origin.sck), etapa: 'compra', campanha: cleanStr(origin.src, 100), src: 'hotmart' });
  } catch (e) { console.warn('CRM: compra não registrada:', e.message); }
}
function safeEqual(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Eventos da Hotmart: https://developers.hotmart.com/docs/pt-BR/webhooks/
const UPGRADE_EVENTS = ['PURCHASE_APPROVED', 'PURCHASE_COMPLETE', 'SWITCH_PLAN'];

// E-mail de boas-vindas (link do dashboard + vídeo de onboarding): 1 por comprador, só na compra aprovada.
// Nunca derruba o webhook: se falhar, libera a trava para a Hotmart poder reenviar o evento e tentar de novo.
async function welcomeOnce(supabase, email, plan, trial) {
  if (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM) return;
  const key = String(email).toLowerCase();
  try {
    const { error } = await supabase.from('welcome_emails').insert({ email: key });
    if (error) { if (error.code !== '23505') console.warn('Boas-vindas: trava indisponível (' + error.message + ') — migração 021 aplicada?'); return; }
    try {
      const r = await sendWelcomeEmail({ to: key, plan, trial });
      if (!r.sent) { await supabase.from('welcome_emails').delete().eq('email', key); console.warn('Boas-vindas não enviado:', r.skipped); }
      else console.log('Boas-vindas enviado para', key);
    } catch (e) { await supabase.from('welcome_emails').delete().eq('email', key); console.error('Boas-vindas falhou:', e.message); }
  } catch (e) { console.error('Boas-vindas erro:', e.message); }
}
const DOWNGRADE_EVENTS = ['PURCHASE_REFUNDED', 'PURCHASE_CHARGEBACK', 'PURCHASE_CANCELED', 'PURCHASE_EXPIRED', 'SUBSCRIPTION_CANCELLATION'];

router.post('/webhook', express.json(), async (req, res) => {
  const body = req.body || {};

  // Autenticação simples via "Hottok" — token estático definido no painel da
  // Hotmart (Ferramentas > Webhook) e conferido aqui. Sem isso, qualquer um
  // poderia forjar uma compra e se auto-promover a Plus.
  const receivedToken = body.hottok || req.query.hottok || req.headers['x-hotmart-hottok'];
  if (!process.env.HOTMART_HOTTOK) {
    console.warn('HOTMART_HOTTOK não configurado — webhook da Hotmart ignorado por segurança.');
    return res.status(503).json({ error: 'Hotmart not configured' });
  }
  if (!safeEqual(receivedToken, process.env.HOTMART_HOTTOK)) {
    console.warn('Hotmart webhook: hottok inválido.');
    return res.status(401).json({ error: 'Invalid hottok' });
  }

  const event = body.event;
  const data = body.data || {};
  const buyerEmail = data.buyer?.email || data.subscriber?.email;
  const productId = data.product?.id;
  const subscriberCode = data.subscription?.subscriber?.code || data.purchase?.subscription?.subscriber?.code;
  const transactionId = data.purchase?.transaction || data.transaction;

  if (!buyerEmail) {
    console.warn('Hotmart webhook sem e-mail do comprador — evento ignorado:', event);
    return res.json({ received: true, skipped: 'no_email' });
  }

  const supabase = getSupabaseAdmin();

  try {
    if (UPGRADE_EVENTS.includes(event)) {
      const byName = resolvePlanFromName(planNameOf(data));
      const trial = byName ? byName.weekly : isTrialProduct(productId);
      const plan = byName ? byName.plan : (trial ? 'basic' : resolvePlanFromProduct(productId));
      if (!plan) {
        console.warn('Hotmart: plano/produto não mapeado (' + (planNameOf(data) || productId) + ') — nenhum plano liberado.');
        return res.json({ received: true, skipped: 'unknown_product' });
      }
      const fields = trial
        ? { plan, plan_status: 'trialing', plan_expires_at: new Date(Date.now() + TRIAL_DAYS * 86400000).toISOString(), payment_provider: 'hotmart', hotmart_transaction_id: transactionId || null }
        : { plan, plan_status: 'active', plan_expires_at: null, payment_provider: 'hotmart', hotmart_subscriber_code: subscriberCode || null, hotmart_transaction_id: transactionId || null };
      let q = supabase.from('profiles').update(fields).ilike('email', likeEscape(buyerEmail));
      // O teste nunca rebaixa nem substitui quem já tem plano pago ativo (só vale para conta sem plano, cancelada ou já em teste).
      if (trial) q = q.or('plan.is.null,plan.eq.free,plan_status.in.(trialing,canceled,cancelled,unpaid,incomplete_expired)');
      const { data: updated, error } = await q.select('id');
      if (error) throw error;
      if (!updated || updated.length === 0) {
        if (trial) {
          const { data: ex } = await supabase.from('profiles').select('id').ilike('email', likeEscape(buyerEmail)).limit(1);
          if (ex && ex.length) { console.log('Hotmart: teste ignorado, conta já tem plano pago:', buyerEmail); return res.json({ received: true, skipped: 'already_paid' }); }
        }
        // Comprador ainda não tem conta no Finança com esse e-mail — comum quando a
        // compra acontece antes do cadastro. Guardamos como "compra pendente" para
        // ativar automaticamente assim que essa pessoa criar a conta com o mesmo e-mail.
        await supabase.from('pending_purchases').upsert({
          email: buyerEmail.toLowerCase(),
          plan,
          trial_days: trial ? TRIAL_DAYS : null,
          hotmart_subscriber_code: subscriberCode || null,
          hotmart_transaction_id: transactionId || null,
        }, { onConflict: 'email' });
        console.log('Hotmart: compra aprovada para e-mail sem conta ainda:', buyerEmail);
      } else {
        console.log('Hotmart: plano', plan, trial ? '(teste de ' + TRIAL_DAYS + ' dias)' : '', 'liberado para', buyerEmail);
      }
      if (event === 'PURCHASE_APPROVED') { await welcomeOnce(supabase, buyerEmail, plan, trial); if (transactionId) await crmRegistrarCompra(supabase, data, buyerEmail, plan, transactionId); }
    } else if (DOWNGRADE_EVENTS.includes(event)) {
      // Cancelar/estornar o produto de TESTE só encerra um teste: nunca derruba uma assinatura mensal ativa.
      let q = supabase.from('profiles').update({ plan: 'free', plan_status: 'canceled', plan_expires_at: null }).ilike('email', likeEscape(buyerEmail)); // 'free' = sem assinatura (o app bloqueia o acesso)
      const dn = resolvePlanFromName(planNameOf(data));
      if (dn ? dn.weekly : isTrialProduct(productId)) q = q.eq('plan_status', 'trialing');
      await q;
      await supabase.from('pending_purchases').delete().ilike('email', likeEscape(buyerEmail));
      if (transactionId && (event === 'PURCHASE_REFUNDED' || event === 'PURCHASE_CHARGEBACK')) { try { await supabase.from('crm_leads').update({ etapa: 'perdido', updated_at: new Date().toISOString() }).eq('hotmart_tx', String(transactionId)); } catch (e) {} }
      console.log('Hotmart: assinatura encerrada —', buyerEmail, '(' + event + ')');
    } else {
      console.log('Hotmart: evento não tratado:', event);
    }
    res.json({ received: true });
  } catch (err) {
    console.error('Hotmart webhook error:', err.message);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

module.exports = router;
