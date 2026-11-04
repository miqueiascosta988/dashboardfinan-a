-- Eventos do app no funil: conta criada e primeira ação. Só amplia a lista permitida; nada é apagado.
alter table public.crm_events drop constraint if exists crm_events_etapa_check;
alter table public.crm_events add constraint crm_events_etapa_check
  check (etapa in ('triagem_visita','triagem_fim','apresentacao_visita','checkout_clique','compra','cadastro_concluido','primeira_acao'));
