-- 013 · Direitos do titular (LGPD): aceite registrado + exclusão da conta
-- Rode no SQL Editor do Supabase. Pode rodar mais de uma vez.

-- 1) Registro do aceite dos Termos e da Política (versão, data)
create table if not exists public.user_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  doc text not null check (doc in ('termos','privacidade','maioridade')),
  version text not null,
  accepted_at timestamptz not null default now(),
  unique (user_id, doc, version)
);
alter table public.user_consents enable row level security;
drop policy if exists "consents ver proprios" on public.user_consents;
drop policy if exists "consents registrar proprios" on public.user_consents;
create policy "consents ver proprios" on public.user_consents for select using (auth.uid() = user_id);
create policy "consents registrar proprios" on public.user_consents for insert with check (auth.uid() = user_id);
-- (sem update/delete: o registro de aceite não é editável)

-- 2) Exclusão da própria conta e de todos os dados do titular
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  t text;
begin
  if uid is null then raise exception 'não autenticado'; end if;
  foreach t in array array['transactions','goals','debts','assets','liabilities','subscriptions','documents','budgets','user_prefs','user_consents','audit_consents'] loop
    if to_regclass('public.' || t) is not null then
      execute format('delete from public.%I where user_id = $1', t) using uid;
    end if;
  end loop;
  if to_regclass('public.audit_requests') is not null then
    execute 'delete from public.audit_requests where client_id = $1' using uid;
  end if;
  if to_regclass('public.profiles') is not null then
    execute 'delete from public.profiles where id = $1' using uid;
  end if;
  -- o log de acessos da equipe (staff_audit_log) é mantido de propósito: guarda de registros por obrigação legal
  delete from auth.users where id = uid;
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
