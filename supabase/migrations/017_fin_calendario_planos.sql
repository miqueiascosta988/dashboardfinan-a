-- 017 · Calendário financeiro e planos de pagamento.
-- fin_events: compromissos (a pagar) e recebimentos, com chave única por usuário (idempotência) e histórico.
-- fin_plans: planos confirmados (A/B/C/D) com a simulação gravada. Cada usuário só enxerga as próprias linhas (RLS).
-- Pode rodar mais de uma vez. Sem dado sensível em notificações: o app só lê título/valor do próprio usuário.
create table if not exists public.fin_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  strategy text not null check (strategy in ('juros','distribuir','reduzir','reserva')),
  status text not null default 'active' check (status in ('active','replaced','cancelled')),
  title text not null,
  data jsonb not null default '{}'::jsonb,           -- parâmetros, premissas, métricas e pagamentos simulados
  confirmed_at timestamptz not null default now(),
  replaced_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists fin_plans_one_active_uq on public.fin_plans (user_id) where status = 'active';

create table if not exists public.fin_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,                                  -- chave determinística: man:<grupo>:<n> | plan:<plano>:<divida>:<n> | doc:<id>
  plan_id uuid references public.fin_plans(id) on delete set null,
  kind text not null check (kind in ('payable','income')),
  title text not null check (char_length(title) between 1 and 120),
  category text,
  amount numeric(14,2) not null check (amount > 0),
  due_date date not null,
  status text not null default 'pending' check (status in ('pending','paid','cancelled','awaiting')),
  paid_at date,
  paid_amount numeric(14,2) check (paid_amount is null or paid_amount >= 0),
  priority text not null default 'normal' check (priority in ('essential','high','normal','low')),
  origin text not null default 'manual' check (origin in ('manual','plan','document','debt','recurring')),
  source_ref text,                                    -- id da dívida/documento de origem
  remind_days int[] not null default '{1}',
  notes text check (notes is null or char_length(notes) <= 300),
  movable boolean not null default false,             -- vencimento pode ser alterado junto ao credor (informado pelo usuário)
  user_edited boolean not null default false,
  tx_id text,                                         -- lançamento gerado ao pagar (evita duplicar)
  version int not null default 1,
  history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fin_events_user_key_uq unique (user_id, key),
  constraint fin_events_paid_ck check (status <> 'paid' or paid_at is not null)
);
create index if not exists fin_events_user_due_idx on public.fin_events (user_id, due_date);
create index if not exists fin_events_plan_idx on public.fin_events (plan_id) where plan_id is not null;

alter table public.fin_events enable row level security;
alter table public.fin_plans enable row level security;
do $$ declare t text; begin
  foreach t in array array['fin_events','fin_plans'] loop
    execute format('drop policy if exists %I on public.%I', t||'_select', t);
    execute format('drop policy if exists %I on public.%I', t||'_insert', t);
    execute format('drop policy if exists %I on public.%I', t||'_update', t);
    execute format('drop policy if exists %I on public.%I', t||'_delete', t);
    execute format('create policy %I on public.%I for select using (auth.uid() = user_id)', t||'_select', t);
    execute format('create policy %I on public.%I for insert with check (auth.uid() = user_id)', t||'_insert', t);
    execute format('create policy %I on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t||'_update', t);
    execute format('create policy %I on public.%I for delete using (auth.uid() = user_id)', t||'_delete', t);
  end loop;
end $$;

-- Evento já pago não pode ser apagado pelo app (só cancelado): protege o histórico.
create or replace function public.fin_events_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'paid' then raise exception 'evento pago não pode ser excluído'; end if;
    return old;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists fin_events_guard_trg on public.fin_events;
create trigger fin_events_guard_trg before update or delete on public.fin_events for each row execute function public.fin_events_guard();
