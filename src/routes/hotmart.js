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
function resolvePlanFromProduct(productId) {
  const id = String(productId || '');
  const map = [['business', process.env.HOTMART_PRODUCT_BUSINESS], ['pro', process.env.HOTMART_PRODUCT_PRO],
    ['plus', process.env.HOTMART_PRODUCT_PLUS], ['basic', process.env.HOTMART_PRODUCT_BASIC]];
  for (const [plan, pid] of map) if (pid && id === String(pid)) return plan;
  return null;
}

// Escapa % _ \ para o e-mail do comprador não virar curinga no ilike.
const likeEscape = (v) => String(v).replace(/[\\%_]/g, (c) => '\\' + c);
const crypto = require('crypto');
function safeEqual(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Eventos da Hotmart: https://developers.hotmart.com/docs/pt-BR/webhooks/
const UPGRADE_EVENTS = ['PURCHASE_APPROVED', 'PURCHASE_COMPLETE'];
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
      const plan = resolvePlanFromProduct(productId);
      if (!plan) {
        console.warn('Hotmart: produto não mapeado (' + productId + ') — nenhum plano liberado. Configure HOTMART_PRODUCT_*.');
        return res.json({ received: true, skipped: 'unknown_product' });
      }
      const { data: updated, error } = await supabase
        .from('profiles')
        .update({
          plan,
          plan_status: 'active',
          payment_provider: 'hotmart',
          hotmart_subscriber_code: subscriberCode || null,
          hotmart_transaction_id: transactionId || null,
        })
        .ilike('email', likeEscape(buyerEmail))
        .select('id');
      if (error) throw error;
      if (!updated || updated.length === 0) {
        // Comprador ainda não tem conta no Finança com esse e-mail — comum quando a
        // compra acontece antes do cadastro. Guardamos como "compra pendente" para
        // ativar automaticamente assim que essa pessoa criar a conta com o mesmo e-mail.
        await supabase.from('pending_purchases').upsert({
          email: buyerEmail.toLowerCase(),
          plan,
          hotmart_subscriber_code: subscriberCode || null,
          hotmart_transaction_id: transactionId || null,
        }, { onConflict: 'email' });
        console.log('Hotmart: compra aprovada para e-mail sem conta ainda:', buyerEmail);
      } else {
        console.log('Hotmart: plano', plan, 'liberado para', buyerEmail);
      }
    } else if (DOWNGRADE_EVENTS.includes(event)) {
      await supabase
        .from('profiles')
        .update({ plan: 'free', plan_status: 'canceled' }) // 'free' = sem assinatura (o app bloqueia o acesso)
        .ilike('email', likeEscape(buyerEmail));
      await supabase.from('pending_purchases').delete().ilike('email', likeEscape(buyerEmail));
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
