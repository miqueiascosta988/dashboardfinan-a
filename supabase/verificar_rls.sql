-- Verificação de RLS (somente leitura). Rode no SQL Editor do Supabase.
-- 1) Tabelas do schema public SEM RLS ativa (o resultado ideal é vazio):
select c.relname as tabela
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
order by 1;

-- 2) Políticas existentes por tabela (confira se cada uma filtra por auth.uid()):
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies where schemaname = 'public' order by tablename, policyname;

-- 3) Tabelas com RLS ativa e NENHUMA política (acesso só via service role, o esperado para staff, crm_*, nutricao, rate_limits):
select c.relname as tabela
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)
order by 1;
-- Teste manual com duas contas: logue com a conta A, tente ler/alterar linhas da conta B pelo app ou pela API REST; deve retornar vazio/erro.
