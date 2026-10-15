-- 019 · Área Empresa "Em breve" para contas novas; contas atuais mantêm acesso antecipado
-- Rode no SQL Editor. Pode rodar mais de uma vez.
-- ATENÇÃO: o UPDATE abaixo libera TODAS as contas que existem agora. Se quiser só algumas,
-- troque a condição (ex.: where email in ('voce@empresa.com')).
alter table public.profiles add column if not exists pj_acesso boolean not null default false;

update public.profiles set pj_acesso = true where pj_acesso = false;   -- contas já existentes

-- O usuário não pode se liberar sozinho: só o servidor / SQL Editor altera.
create or replace function public.profiles_lock_pj_acesso() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'authenticated' then return new; end if;
  if tg_op = 'INSERT' then new.pj_acesso := false;
  else new.pj_acesso := old.pj_acesso; end if;
  return new;
end $$;
drop trigger if exists profiles_lock_pj_acesso on public.profiles;
create trigger profiles_lock_pj_acesso before insert or update on public.profiles
  for each row execute function public.profiles_lock_pj_acesso();

-- Liberar mais uma conta depois:
--   update public.profiles set pj_acesso = true where id = (select id from auth.users where email = 'fulano@x.com');
