-- Controle do e-mail semanal "Plano da semana": uma linha por usuário (última semana enviada e opção de sair).
create table if not exists public.week_digest (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  last_week text,
  opt_out boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.week_digest enable row level security;  -- sem policies: só a service role (servidor) acessa
