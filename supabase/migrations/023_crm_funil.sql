-- CRM + funil de vendas + painel de tráfego pago (uso exclusivo da equipe).
-- Eventos do funil (anônimos: só um código aleatório do visitante + origem/campanha, sem dados pessoais).
create table if not exists public.crm_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  visitor text not null,
  etapa text not null check (etapa in ('triagem_visita','triagem_fim','apresentacao_visita','checkout_clique','compra')),
  src text, campanha text, medium text, content text
);
create index if not exists crm_events_created on public.crm_events (created_at);
create index if not exists crm_events_visitor on public.crm_events (visitor);
-- Contatos acompanhados pela equipe (follow-up) e compradores da Hotmart.
create table if not exists public.crm_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  nome text, contato text, email text,
  origem text, campanha text,
  etapa text not null default 'novo' check (etapa in ('novo','conversando','trial','cliente','perdido')),
  valor numeric(12,2),
  plano text,
  notas text,
  proximo_contato date,
  hotmart_tx text unique
);
create index if not exists crm_leads_etapa on public.crm_leads (etapa);
-- Investimento em anúncios por dia e campanha (Meta automático, CSV ou digitado).
create table if not exists public.crm_ads (
  id bigint generated always as identity primary key,
  dia date not null,
  campanha text not null,
  investimento numeric(12,2) not null default 0,
  impressoes integer not null default 0,
  cliques integer not null default 0,
  fonte text not null default 'manual' check (fonte in ('meta','csv','manual')),
  unique (dia, campanha, fonte)
);
alter table public.crm_events enable row level security;
alter table public.crm_leads enable row level security;
alter table public.crm_ads enable row level security;
-- Eventos entram só pelo servidor (service role). A equipe lê; ninguém mais.
drop policy if exists "staff le eventos" on public.crm_events;
create policy "staff le eventos" on public.crm_events for select using (public.is_staff());
drop policy if exists "staff gerencia leads" on public.crm_leads;
create policy "staff gerencia leads" on public.crm_leads for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists "staff gerencia anuncios" on public.crm_ads;
create policy "staff gerencia anuncios" on public.crm_ads for all using (public.is_staff()) with check (public.is_staff());
