-- ═══════════════════════════════════════════════════════
-- Finança — Schema inicial
-- ═══════════════════════════════════════════════════════

-- ─── Profiles (extends Supabase auth.users) ─────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null default '',
  profile_type text not null default 'PF' check (profile_type in ('PF', 'PJ')),
  currency text not null default 'BRL' check (currency in ('BRL', 'USD', 'EUR', 'GBP')),
  monthly_income numeric(15,2) not null default 0,
  plan text not null default 'free' check (plan in ('free', 'plus', 'pro', 'business')),
  plan_status text default 'active',
  stripe_customer_id text,
  stripe_subscription_id text,
  onboarding_done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── Transactions ───────────────────────────────────
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  description text not null,
  category text not null,
  amount numeric(15,2) not null,
  date date not null default current_date,
  recurring boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);
create index idx_transactions_user on public.transactions(user_id, date desc);

-- ─── Goals ──────────────────────────────────────────
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  icon text default '🎯',
  target_amount numeric(15,2) not null,
  current_amount numeric(15,2) not null default 0,
  monthly_contribution numeric(15,2) not null default 0,
  target_date date,
  created_at timestamptz not null default now()
);
create index idx_goals_user on public.goals(user_id);

-- ─── Debts ──────────────────────────────────────────
create table public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  type text not null, -- cartão, financiamento, empréstimo, parcelamento
  balance numeric(15,2) not null,
  interest_rate numeric(8,4) not null default 0, -- % ao mês
  installments integer, -- null = rotativo
  monthly_payment numeric(15,2) not null default 0,
  created_at timestamptz not null default now()
);
create index idx_debts_user on public.debts(user_id);

-- ─── Assets ─────────────────────────────────────────
create table public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  category text not null default 'Outros', -- Conta corrente, Poupança, Investimentos, Imóvel, etc.
  value numeric(15,2) not null,
  created_at timestamptz not null default now()
);
create index idx_assets_user on public.assets(user_id);

-- ─── Liabilities ────────────────────────────────────
create table public.liabilities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  value numeric(15,2) not null,
  created_at timestamptz not null default now()
);
create index idx_liabilities_user on public.liabilities(user_id);

-- ─── Subscriptions ──────────────────────────────────
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  category text not null,
  price numeric(10,2) not null,
  color text default '#666666',
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly', 'yearly')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index idx_subscriptions_user on public.subscriptions(user_id);

-- ═══════════════════════════════════════════════════════
-- Row Level Security — cada usuário vê só seus dados
-- ═══════════════════════════════════════════════════════

alter table public.profiles enable row level security;
alter table public.transactions enable row level security;
alter table public.goals enable row level security;
alter table public.debts enable row level security;
alter table public.assets enable row level security;
alter table public.liabilities enable row level security;
alter table public.subscriptions enable row level security;

-- Profiles
create policy "Users read own profile" on public.profiles
  for select using (auth.uid() = id);
create policy "Users update own profile" on public.profiles
  for update using (auth.uid() = id);
create policy "Users insert own profile" on public.profiles
  for insert with check (auth.uid() = id);

-- Generic policy for all data tables
do $$
declare
  t text;
begin
  foreach t in array array['transactions', 'goals', 'debts', 'assets', 'liabilities', 'subscriptions']
  loop
    execute format('
      create policy "Users manage own %1$s" on public.%1$s
        for all using (auth.uid() = user_id)
        with check (auth.uid() = user_id);
    ', t);
  end loop;
end
$$;

-- ═══════════════════════════════════════════════════════
-- Auto-create profile on signup
-- ═══════════════════════════════════════════════════════

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ═══════════════════════════════════════════════════════
-- Updated_at trigger
-- ═══════════════════════════════════════════════════════

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
