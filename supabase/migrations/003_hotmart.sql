-- ═══════════════════════════════════════════════════════
-- Finança — Migration 003: Hotmart
-- ═══════════════════════════════════════════════════════

-- ─── Novos campos em profiles ───────────────────────────
alter table public.profiles
  add column if not exists payment_provider text default 'none' check (payment_provider in ('none', 'stripe', 'hotmart')),
  add column if not exists hotmart_subscriber_code text,
  add column if not exists hotmart_transaction_id text;

-- ─── Compras pendentes ───────────────────────────────────
-- Quando alguém compra na Hotmart ANTES de criar a conta no Finança (comum,
-- já que o checkout da Hotmart não exige login prévio), guardamos aqui até
-- a pessoa se cadastrar com o mesmo e-mail — aí o plano é aplicado sozinho.
create table if not exists public.pending_purchases (
  email text primary key,
  plan text not null check (plan in ('plus', 'pro', 'business')),
  hotmart_subscriber_code text,
  hotmart_transaction_id text,
  created_at timestamptz not null default now()
);

-- RLS ativo e SEM policies: só o service role (usado pelo webhook) acessa esta
-- tabela. Nenhum usuário comum deve poder ler ou escrever aqui diretamente.
alter table public.pending_purchases enable row level security;

-- ─── Atualiza a criação automática de perfil para consumir compra pendente ──
create or replace function public.handle_new_user()
returns trigger as $$
declare
  pending record;
begin
  select * into pending from public.pending_purchases where email = new.email limit 1;

  insert into public.profiles (id, email, name, plan, plan_status, payment_provider, hotmart_subscriber_code, hotmart_transaction_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(pending.plan, 'free'),
    case when pending.plan is not null then 'active' else 'active' end,
    case when pending.plan is not null then 'hotmart' else 'none' end,
    pending.hotmart_subscriber_code,
    pending.hotmart_transaction_id
  );

  if pending.email is not null then
    delete from public.pending_purchases where email = new.email;
  end if;

  return new;
end;
$$ language plpgsql security definer;
