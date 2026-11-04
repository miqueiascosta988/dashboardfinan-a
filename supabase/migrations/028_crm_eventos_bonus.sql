-- Bônus de boas-vindas (3 documentos em 48 h): eventos de uso no funil. Só amplia a lista permitida; nada é apagado.
alter table public.crm_events drop constraint if exists crm_events_etapa_check;
alter table public.crm_events add constraint crm_events_etapa_check
  check (etapa in ('triagem_visita','triagem_fim','apresentacao_visita','checkout_clique','compra','cadastro_concluido','primeira_acao','bonus_usado','bonus_esgotado'));
