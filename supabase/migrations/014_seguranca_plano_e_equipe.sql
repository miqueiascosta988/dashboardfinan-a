-- 014 · Segurança: trava do plano + acesso da equipe só com consentimento do cliente
-- Pré-requisito: 009 (is_staff) e 010. Rode no SQL Editor. Pode rodar mais de uma vez.

-- A) O usuário não consegue mudar o próprio plano nem dados de cobrança.
--    Só o servidor (service role: webhooks de pagamento) ou o SQL Editor alteram.
create or replace function public.profiles_lock_billing() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n jsonb := to_jsonb(new);
  o jsonb;
  k text;
begin
  if coalesce(auth.role(), '') <> 'authenticated' or current_setting('app.billing_sync', true) = '1' then
    return new;                      -- service role, SQL Editor, triggers internos
  end if;
  if tg_op = 'INSERT' then
    if n ? 'plan' then n := jsonb_set(n, array['plan'], to_jsonb('free'::text)); end if;
    foreach k in array array['plan_status','stripe_customer_id','stripe_subscription_id','plan_expires_at','hotmart_transaction','hotmart_transaction_id','hotmart_subscriber_code','payment_provider'] loop
      if n ? k then n := jsonb_set(n, array[k], 'null'::jsonb); end if;
    end loop;
    return jsonb_populate_record(new, n);
  end if;
  o := to_jsonb(old);
  foreach k in array array['plan','plan_status','stripe_customer_id','stripe_subscription_id','plan_expires_at','hotmart_transaction','hotmart_transaction_id','hotmart_subscriber_code','payment_provider'] loop
    if o ? k then n := jsonb_set(n, array[k], o -> k); end if;
  end loop;
  return jsonb_populate_record(new, n);
end $$;

do $$ begin
  if to_regclass('public.profiles') is not null then
    execute 'drop trigger if exists profiles_lock_billing on public.profiles';
    execute 'create trigger profiles_lock_billing before insert or update on public.profiles for each row execute function public.profiles_lock_billing()';
  end if;
end $$;

-- B) Consentimento do cliente para a Auditoria Fiscal interna
create table if not exists public.audit_consents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table public.audit_consents enable row level security;
drop policy if exists "consent ver proprio" on public.audit_consents;
drop policy if exists "consent registrar proprio" on public.audit_consents;
drop policy if exists "consent alterar proprio" on public.audit_consents;
create policy "consent ver proprio" on public.audit_consents for select using (auth.uid() = user_id or public.is_staff());
create policy "consent registrar proprio" on public.audit_consents for insert with check (auth.uid() = user_id);
create policy "consent alterar proprio" on public.audit_consents for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.staff_can_read(client uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select public.is_staff()
    and exists (select 1 from public.profiles p where p.id = client and p.profile_type = 'PJ')
    and exists (select 1 from public.audit_consents c where c.user_id = client and c.revoked_at is null)
$$;

-- C) A equipe só lê dados de EMPRESAS que deram consentimento (não mais todos os clientes)
do $$ begin
  if to_regclass('public.profiles') is not null then
    execute 'drop policy if exists "staff le perfis" on public.profiles';
    execute 'create policy "staff le perfis" on public.profiles for select using (public.staff_can_read(id))';
  end if;
  if to_regclass('public.transactions') is not null then
    execute 'drop policy if exists "staff le lancamentos" on public.transactions';
    execute 'create policy "staff le lancamentos" on public.transactions for select using (public.staff_can_read(user_id))';
  end if;
  if to_regclass('public.documents') is not null then
    execute 'drop policy if exists "staff le documentos" on public.documents';
    execute 'create policy "staff le documentos" on public.documents for select using (public.staff_can_read(user_id))';
  end if;
end $$;

-- D) O titular vê quem acessou os dados dele; o log ganha motivo e não pode ser apagado
alter table public.staff_audit_log add column if not exists reason text;
drop policy if exists "titular ve acessos" on public.staff_audit_log;
create policy "titular ve acessos" on public.staff_audit_log for select using (client_id = auth.uid());
drop policy if exists "admin le todo o log" on public.staff_audit_log;
create policy "admin le todo o log" on public.staff_audit_log for select
  using (exists (select 1 from public.staff s where s.user_id = auth.uid() and s.role = 'admin'));
