-- 010 — Pedidos de documentos da equipe ao cliente
-- Pré-requisito: 009_staff_auditoria.sql (função is_staff()). Pode rodar mais de uma vez.

create table if not exists public.audit_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references auth.users(id) on delete cascade,
  staff_id uuid references auth.users(id) on delete set null,
  title text not null check (char_length(title) between 1 and 120),
  detail text check (detail is null or char_length(detail) <= 500),
  period text check (period is null or char_length(period) <= 40),
  status text not null default 'aberto' check (status in ('aberto','enviado','concluido','cancelado')),
  client_note text check (client_note is null or char_length(client_note) <= 500),
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists audit_requests_client_idx on public.audit_requests (client_id, created_at desc);
alter table public.audit_requests enable row level security;

drop policy if exists "ver pedidos" on public.audit_requests;
create policy "ver pedidos" on public.audit_requests for select using (client_id = auth.uid() or public.is_staff());
drop policy if exists "equipe cria pedidos" on public.audit_requests;
create policy "equipe cria pedidos" on public.audit_requests for insert with check (public.is_staff() and staff_id = auth.uid());
drop policy if exists "equipe atualiza pedidos" on public.audit_requests;
create policy "equipe atualiza pedidos" on public.audit_requests for update using (public.is_staff()) with check (public.is_staff());
drop policy if exists "cliente responde o proprio pedido" on public.audit_requests;
create policy "cliente responde o proprio pedido" on public.audit_requests for update using (client_id = auth.uid()) with check (client_id = auth.uid());
-- (sem policy de delete: ninguém apaga pedidos)

-- O cliente só pode marcar como "enviado" e deixar um recado; nada mais muda
create or replace function public.audit_requests_guard() returns trigger language plpgsql as $$
begin
  if not public.is_staff() then
    if new.client_id <> old.client_id or new.staff_id is distinct from old.staff_id or new.title <> old.title
       or new.detail is distinct from old.detail or new.period is distinct from old.period or new.created_at <> old.created_at then
      raise exception 'campos protegidos';
    end if;
    if old.status in ('concluido','cancelado') then raise exception 'pedido encerrado'; end if;
    if new.status <> old.status and new.status <> 'enviado' then raise exception 'status inválido'; end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists audit_requests_guard on public.audit_requests;
create trigger audit_requests_guard before update on public.audit_requests for each row execute function public.audit_requests_guard();
