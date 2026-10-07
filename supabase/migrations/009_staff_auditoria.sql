-- 009 — Equipe interna + Auditoria Fiscal interna
-- Cria a tabela de equipe, a função is_staff(), as políticas de LEITURA da equipe e o log de auditorias.
-- Rode no SQL Editor do Supabase. Pode rodar mais de uma vez.

create table if not exists public.staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'auditor' check (role in ('auditor','admin')),
  created_at timestamptz not null default now()
);
alter table public.staff enable row level security;
drop policy if exists "staff le a propria linha" on public.staff;
create policy "staff le a propria linha" on public.staff for select using (auth.uid() = user_id);
-- (sem policy de insert/update/delete: a equipe só é cadastrada pelo SQL Editor, abaixo)

create or replace function public.is_staff() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.staff where user_id = auth.uid())
$$;

-- Leitura (somente SELECT) para a equipe nas tabelas usadas na auditoria
do $$ begin
  if to_regclass('public.profiles') is not null then
    execute 'drop policy if exists "staff le perfis" on public.profiles';
    execute 'create policy "staff le perfis" on public.profiles for select using (public.is_staff())';
  end if;
  if to_regclass('public.transactions') is not null then
    execute 'drop policy if exists "staff le lancamentos" on public.transactions';
    execute 'create policy "staff le lancamentos" on public.transactions for select using (public.is_staff())';
  end if;
  if to_regclass('public.documents') is not null then
    execute 'drop policy if exists "staff le documentos" on public.documents';
    execute 'create policy "staff le documentos" on public.documents for select using (public.is_staff())';
  end if;
end $$;

-- Registro de quem auditou qual empresa (trilha para a LGPD)
create table if not exists public.staff_audit_log (
  id bigint generated always as identity primary key,
  staff_id uuid not null,
  client_id uuid not null,
  action text not null default 'audit',
  score int,
  created_at timestamptz not null default now()
);
alter table public.staff_audit_log enable row level security;
drop policy if exists "staff registra auditoria" on public.staff_audit_log;
create policy "staff registra auditoria" on public.staff_audit_log for insert with check (public.is_staff() and staff_id = auth.uid());
drop policy if exists "staff le o proprio log" on public.staff_audit_log;
create policy "staff le o proprio log" on public.staff_audit_log for select using (staff_id = auth.uid());

-- ► CADASTRAR MEMBROS DA EQUIPE (troque o e-mail pelo e-mail da conta que já existe no app):
-- insert into public.staff (user_id, email, role)
--   select id, email, 'admin' from auth.users where email = 'email-da-conta@dominio.com.br'
--   on conflict (user_id) do nothing;
