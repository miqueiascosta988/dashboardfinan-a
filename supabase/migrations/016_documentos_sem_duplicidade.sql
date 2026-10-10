-- 016 · Documentos: um arquivo = um registro. Impede, no banco, o mesmo arquivo (hash SHA-256) duas vezes por usuário.
-- Pré-requisito: 012 (tabela documents com extracted_data jsonb). Pode rodar mais de uma vez.
-- O app já deduplica antes de gravar; este índice é a segunda trava (corrida entre duas abas, reenvio, bug futuro).
do $$ begin
  if to_regclass('public.documents') is not null then
    -- remove duplicatas antigas do MESMO arquivo, mantendo a mais antiga (rode só se a verificação abaixo listar algo)
    -- select user_id, extracted_data->>'contentHash' h, count(*) from public.documents where extracted_data ? 'contentHash' group by 1,2 having count(*) > 1;
    execute $i$ create unique index if not exists documents_user_content_hash_uq
      on public.documents (user_id, ((extracted_data->>'contentHash')))
      where extracted_data ? 'contentHash' and coalesce(extracted_data->>'contentHash','') <> '' $i$;
    execute $i$ create index if not exists documents_user_category_idx on public.documents (user_id, category) $i$;
  end if;
end $$;
