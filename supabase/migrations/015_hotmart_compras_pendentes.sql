-- 015 · Hotmart: compra feita antes do cadastro é ativada quando a conta é criada com o mesmo e-mail.
-- Pré-requisito: 014. Rode no SQL Editor. Pode rodar mais de uma vez.
create table if not exists public.pending_purchases (
  email text primary key,
  plan text not null,
  hotmart_subscriber_code text,
  hotmart_transaction_id text,
  created_at timestamptz not null default now()
);
alter table public.pending_purchases enable row level security;   -- sem políticas: só o servidor (service role) acessa

create or replace function public.apply_pending_purchase() returns trigger
language plpgsql security definer set search_path = public as $$
declare pp public.pending_purchases%rowtype;
begin
  if new.email is null then return null; end if;
  select * into pp from public.pending_purchases where email = lower(new.email);
  if not found then return null; end if;
  perform set_config('app.billing_sync', '1', true);   -- libera a trava de plano só nesta transação
  update public.profiles set plan = pp.plan, plan_status = 'active', payment_provider = 'hotmart',
    hotmart_subscriber_code = pp.hotmart_subscriber_code, hotmart_transaction_id = pp.hotmart_transaction_id
  where id = new.id;
  perform set_config('app.billing_sync', '', true);
  delete from public.pending_purchases where email = pp.email;
  return null;
end $$;

drop trigger if exists profiles_apply_pending on public.profiles;
create trigger profiles_apply_pending after insert on public.profiles
  for each row execute function public.apply_pending_purchase();
