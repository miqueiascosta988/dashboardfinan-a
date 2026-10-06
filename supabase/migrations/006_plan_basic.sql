-- Migration 006: novo plano 'basic' (pago). 'free' passa a ser o plano gratuito, mais limitado.
-- Contas existentes continuam 'free' (agora o Free enxuto). Seguro rodar mais de uma vez.

alter table public.profiles drop constraint if exists profiles_plan_check;
alter table public.profiles
  add constraint profiles_plan_check
  check (plan in ('free', 'basic', 'plus', 'pro', 'business'));

-- Compras da Hotmart feitas antes do cadastro (003_hotmart.sql)
alter table public.pending_purchases drop constraint if exists pending_purchases_plan_check;
alter table public.pending_purchases
  add constraint pending_purchases_plan_check
  check (plan in ('basic', 'plus', 'pro', 'business'));
