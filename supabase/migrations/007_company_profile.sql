-- Migration 007: perfil da empresa (PJ) — tipo, atividade e forma de faturar.
-- Usado para moldar menu, categorias, reserva de caixa e alertas fiscais. Seguro rodar mais de uma vez.
alter table public.profiles
  add column if not exists company_type text,
  add column if not exists pj_activity text,
  add column if not exists billing_pattern text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_company_type_check') then
    alter table public.profiles add constraint profiles_company_type_check
      check (company_type is null or company_type in ('mei','simples','epp','presumido','real','liberal','ong','startup'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_pj_activity_check') then
    alter table public.profiles add constraint profiles_pj_activity_check
      check (pj_activity is null or pj_activity in ('comercio','servicos','industria','misto'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_billing_pattern_check') then
    alter table public.profiles add constraint profiles_billing_pattern_check
      check (billing_pattern is null or billing_pattern in ('recorrente','sazonal','projeto'));
  end if;
end
$$;
