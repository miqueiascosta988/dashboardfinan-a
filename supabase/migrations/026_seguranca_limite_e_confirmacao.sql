-- 1) Limite de requisições persistente (rotas públicas), sem guardar IP em texto: a chave já vem com hash.
create table if not exists public.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  hits integer not null default 0
);
alter table public.rate_limits enable row level security;   -- sem policies: só a service role (servidor)
create or replace function public.rate_hit(p_key text, p_max integer, p_window_s integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_hits integer;
begin
  insert into public.rate_limits as t (key, window_start, hits) values (p_key, now(), 1)
  on conflict (key) do update set
    window_start = case when t.window_start < now() - make_interval(secs => p_window_s) then now() else t.window_start end,
    hits = case when t.window_start < now() - make_interval(secs => p_window_s) then 1 else t.hits + 1 end
  returning t.hits into v_hits;
  if random() < 0.01 then delete from public.rate_limits where window_start < now() - interval '1 day'; end if;
  return v_hits <= p_max;
end $$;
revoke all on function public.rate_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_hit(text, integer, integer) to service_role;

-- 2) Confirmação de e-mail (double opt-in) da sequência da triagem.
alter table public.nutricao add column if not exists confirmed_at timestamptz;
alter table public.nutricao add column if not exists confirm_sent_at timestamptz;
-- quem já recebeu e-mails antes desta migração é tratado como já confirmado
update public.nutricao set confirmed_at = coalesce(last_sent_at, created_at) where confirmed_at is null and step > 0;
