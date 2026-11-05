-- 030: aceita o evento 'primeira_vitoria' no funil (CRM). Não apaga nada; só recria a regra de validação.
alter table public.crm_events drop constraint if exists crm_events_etapa_check;
alter table public.crm_events add constraint crm_events_etapa_check
  check (etapa in ('triagem_visita','triagem_fim','apresentacao_visita','checkout_clique','compra','cadastro_concluido','primeira_acao','bonus_usado','bonus_esgotado','primeira_vitoria'));
