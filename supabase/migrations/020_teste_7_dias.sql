-- 020 · Teste de 7 dias (Basic por R$ 5) → Basic R$ 8/mês
-- Pré-requisitos: 014 e 015. Rode no SQL Editor. Pode rodar mais de uma vez.
-- plan_status = 'trialing' + plan_expires_at = fim do teste. O app só libera acesso enquanto a data não passou.
alter table public.profiles add column if not exists plan_expires_at timestamptz;
alter table public.pending_purchases add column if not exists trial_days int;

create or replace function public.apply_pending_purchase() returns trigger
language plpgsql security definer set search_path = public as $$
declare pp public.pending_purchases%rowtype;
begin
  if new.email is null then return null; end if;
  select * into pp from public.pending_purchases where email = lower(new.email);
  if not found then return null; end if;
  perform set_config('app.billing_sync', '1', true);   -- libera a trava de plano só nesta transação
  update public.profiles set plan = pp.plan,
    plan_status = case when pp.trial_days is not null then 'trialing' else 'active' end,
    plan_expires_at = case when pp.trial_days is not null then now() + make_interval(days => pp.trial_days) else null end,
    payment_provider = 'hotmart',
    hotmart_subscriber_code = pp.hotmart_subscriber_code, hotmart_transaction_id = pp.hotmart_transaction_id
  where id = new.id;
  perform set_config('app.billing_sync', '', true);
  delete from public.pending_purchases where email = pp.email;
  return null;
end $$;

-- Conferência: contas em teste e quando acaba
-- select email, plan, plan_status, plan_expires_at from public.profiles where plan_status = 'trialing' order by plan_expires_at;
