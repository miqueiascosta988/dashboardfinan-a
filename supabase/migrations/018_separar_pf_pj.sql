-- 018 · Separação PF × PJ: eventos e planos da agenda passam a pertencer a UM perfil.
-- Documentos já carregam o perfil dentro de extracted_data->>'profile' (sem alteração de tabela).
-- Pode rodar mais de uma vez. Linhas antigas ficam com profile nulo: o app deduz pelo documento/dívida de origem e grava na próxima edição.
do $$ begin
  if to_regclass('public.fin_events') is not null then
    execute $i$ alter table public.fin_events add column if not exists profile text $i$;
    execute $i$ do $c$ begin
      if not exists (select 1 from pg_constraint where conname = 'fin_events_profile_ck') then
        alter table public.fin_events add constraint fin_events_profile_ck check (profile is null or profile in ('PF','PJ'));
      end if; end $c$ $i$;
    execute $i$ create index if not exists fin_events_user_profile_idx on public.fin_events (user_id, profile, due_date) $i$;
  end if;
  if to_regclass('public.fin_plans') is not null then
    -- antes: um plano ativo por usuário. Agora: um plano ativo por usuário E por perfil (guardado em data->>'profile'; ausente = PF).
    execute $i$ drop index if exists public.fin_plans_one_active_uq $i$;
    execute $i$ create unique index if not exists fin_plans_one_active_per_profile_uq
      on public.fin_plans (user_id, (coalesce(data->>'profile','PF'))) where status = 'active' $i$;
  end if;
end $$;
