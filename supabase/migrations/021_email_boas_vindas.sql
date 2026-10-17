-- Controle do e-mail automático de boas-vindas: um envio por e-mail de comprador (evita repetir a cada renovação/evento).
create table if not exists public.welcome_emails (
  email text primary key,
  sent_at timestamptz not null default now()
);
alter table public.welcome_emails enable row level security;  -- sem policies: só a service role (servidor) acessa
