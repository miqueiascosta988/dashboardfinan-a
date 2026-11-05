-- 029 · Limites do plano no servidor (AUD-11)
-- Hoje os tetos de lançamentos (Free 15, Basic 60) só valem no navegador. Esta migration cria a trava no banco.
-- SEGURANÇA DE DEPLOY: a trava nasce DESLIGADA. Rode primeiro, publique o app e só depois ligue (veja o fim do arquivo).
-- Pré-requisitos: 001, 014 e 020. Pode rodar mais de uma vez.

-- Chave de liga/desliga (sem policies: só o SQL Editor e a service role leem e gravam).
create table if not exists public.app_settings (key text primary key, value text not null);
alter table public.app_settings enable row level security;
insert into public.app_settings (key, value) values ('enforce_plan_limits', 'off') on conflict (key) do nothing;

-- Plano em vigor, igual ao do app: o pago ativo, ou o teste de 7 dias com 2 dias de tolerância; senão, Free.
create or replace function public.plano_efetivo(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when pr.plan in ('basic', 'plus', 'pro', 'business')
       and coalesce(pr.plan_status, 'active') not in ('canceled', 'cancelled', 'unpaid', 'incomplete_expired')
       and (coalesce(pr.plan_status, 'active') <> 'trialing'
            or (pr.plan_expires_at is not null and pr.plan_expires_at + interval '2 days' > now()))
      then pr.plan else 'free' end
    from public.profiles pr where pr.id = p_user
  ), 'free');
$$;

-- Trava: recusa um lançamento NOVO quando o mês corrente já está no teto do plano.
-- Espelha o app: conta os lançamentos com data no mês corrente, independente da data do novo lançamento.
create or replace function public.limite_lancamentos() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_teto int; v_usados int;
begin
  if coalesce(auth.role(), '') <> 'authenticated' then return new; end if;                       -- equipe e servidor não passam pela trava
  if coalesce((select value from public.app_settings where key = 'enforce_plan_limits'), 'off') <> 'on' then return new; end if;
  if exists (select 1 from public.transactions t where t.id = new.id) then return new; end if;   -- edição (upsert) não conta como novo
  v_teto := case public.plano_efetivo(new.user_id) when 'free' then 15 when 'basic' then 60 else null end;
  if v_teto is null then return new; end if;                                                      -- Plus, Pro e Business: sem teto
  select count(*) into v_usados from public.transactions t
   where t.user_id = new.user_id and t.date >= date_trunc('month', now())::date and t.date < (date_trunc('month', now()) + interval '1 month')::date;
  if v_usados >= v_teto then
    raise exception 'limite_plano: o plano permite % lançamentos por mês', v_teto using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists trg_limite_lancamentos on public.transactions;
create trigger trg_limite_lancamentos before insert on public.transactions
  for each row execute function public.limite_lancamentos();

-- PARA LIGAR (depois de publicar o app do ciclo 14):  update public.app_settings set value = 'on'  where key = 'enforce_plan_limits';
-- PARA DESLIGAR a qualquer momento:                   update public.app_settings set value = 'off' where key = 'enforce_plan_limits';
