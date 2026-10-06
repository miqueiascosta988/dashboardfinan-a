const express = require('express');
const router = express.Router();

const { createClient } = require('@supabase/supabase-js');

function getSupabaseAdmin() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// Mapeia o ID do produto/oferta cadastrado na Hotmart para o plano interno do Finança.
// Configure HOTMART_PRODUCT_PLUS (e opcionalmente _PRO / _BUSINESS) com o "Product ID"
// que aparece no painel da Hotmart (Produtos > seu produto > Detalhes).
function resolvePlanFromProduct(productId) {
  const id = String(productId || '');
  if (process.env.HOTMART_PRODUCT_BUSINESS && id === process.env.HOTMART_PRODUCT_BUSINESS) return 'business';
  if (process.env.HOTMART_PRODUCT_PRO && id === process.env.HOTMART_PRODUCT_PRO) return 'pro';
  if (process.env.HOTMART_PRODUCT_PLUS && id === process.env.HOTMART_PRODUCT_PLUS) return 'plus';
  // Fallback: se só existe um produto configurado (o mais comum no começo), assume Plus.
  return 'plus';
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
  if (receivedToken !== process.env.HOTMART_HOTTOK) {
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
      const { data: updated, error } = await supabase
        .from('profiles')
        .update({
          plan,
          plan_status: 'active',
          payment_provider: 'hotmart',
          hotmart_subscriber_code: subscriberCode || null,
          hotmart_transaction_id: transactionId || null,
        })
        .ilike('email', buyerEmail)
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
        .update({ plan: 'free', plan_status: 'canceled' })
        .ilike('email', buyerEmail);
      await supabase.from('pending_purchases').delete().ilike('email', buyerEmail);
      console.log('Hotmart: plano revertido para free —', buyerEmail, '(' + event + ')');
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
