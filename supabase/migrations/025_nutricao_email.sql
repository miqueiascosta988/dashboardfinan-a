-- Sequência de e-mails para quem fez a triagem e pediu para receber o resultado (com consentimento).
-- Só o servidor (service role) acessa; sem policies.
create table if not exists public.nutricao (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  visitor text,
  campanha text,
  src text,
  consentimento_em timestamptz not null default now(),
  step integer not null default 0,           -- quantos e-mails já saíram (0 a 3)
  last_sent_at timestamptz,
  opt_out boolean not null default false,
  converted boolean not null default false,  -- virou cliente: a sequência para
  created_at timestamptz not null default now()
);
create unique index if not exists nutricao_email_uq on public.nutricao (lower(email));
alter table public.nutricao enable row level security;
