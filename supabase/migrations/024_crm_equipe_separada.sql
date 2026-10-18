-- Acesso separado: quem entra na AUDITORIA (tabela `staff`) NÃO entra no CRM, e quem entra no CRM (tabela `crm_staff`) NÃO entra na Auditoria.
-- Rode depois da 023. Para liberar alguém no CRM:
--   insert into public.crm_staff (user_id, email) values ('USER-ID', 'pessoa@empresa.com');
-- Para tirar o acesso:  delete from public.crm_staff where email = 'pessoa@empresa.com';
create table if not exists public.crm_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);
alter table public.crm_staff enable row level security;
drop policy if exists "crm_staff le a propria linha" on public.crm_staff;
create policy "crm_staff le a propria linha" on public.crm_staff for select using (auth.uid() = user_id);
create or replace function public.is_crm_staff() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.crm_staff where user_id = auth.uid())
$$;
-- As tabelas do CRM passam a depender só da equipe do CRM (a equipe da Auditoria perde o acesso a elas).
drop policy if exists "staff le eventos" on public.crm_events;
drop policy if exists "crm le eventos" on public.crm_events;
create policy "crm le eventos" on public.crm_events for select using (public.is_crm_staff());
drop policy if exists "staff gerencia leads" on public.crm_leads;
drop policy if exists "crm gerencia leads" on public.crm_leads;
create policy "crm gerencia leads" on public.crm_leads for all using (public.is_crm_staff()) with check (public.is_crm_staff());
drop policy if exists "staff gerencia anuncios" on public.crm_ads;
drop policy if exists "crm gerencia anuncios" on public.crm_ads;
create policy "crm gerencia anuncios" on public.crm_ads for all using (public.is_crm_staff()) with check (public.is_crm_staff());
