-- ═══════════════════════════════════════════════════════
-- Finança — Migration 005: vínculo de trabalho e previsibilidade de renda (PF)
-- ═══════════════════════════════════════════════════════
-- Usado para moldar o dashboard: reserva-alvo, base de orçamento, categorias
-- de receita, cartões da Visão Geral e dicas mudam conforme o vínculo.
-- Seguro para rodar mais de uma vez (idempotente).

alter table public.profiles
  add column if not exists occupation text,
  add column if not exists income_stability text;

-- Constraints separadas e condicionais, para o script poder rodar de novo
-- sem erro caso elas já existam.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_occupation_check') then
    alter table public.profiles
      add constraint profiles_occupation_check
      check (occupation is null or occupation in (
        'clt', 'servidor', 'autonomo', 'mei', 'empresario',
        'aposentado', 'estudante', 'mista', 'sem_renda'
      ));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'profiles_income_stability_check') then
    alter table public.profiles
      add constraint profiles_income_stability_check
      check (income_stability is null or income_stability in ('fixa', 'media', 'variavel'));
  end if;
end
$$;

-- Perfis já existentes ficam com NULL: o app trata como "não informado" e
-- oferece escolher o vínculo pelo chip no topo, sem quebrar nada.
