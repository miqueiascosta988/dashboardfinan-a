-- 012 · Conta Pessoal (PF) só recebe documentos da pessoa física
-- Segunda camada de proteção: mesmo que alguém contorne a tela, o banco recusa.
-- Rode no SQL Editor do Supabase (idempotente).

create or replace function public.documents_pf_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
  emit_doc text;
  dest_doc text;
begin
  select profile_type, document_type, document_number into p
    from public.profiles where id = new.user_id;

  -- só vale para contas Pessoal; sem perfil ou perfil Empresa passa
  if p.profile_type is distinct from 'PF' then
    return new;
  end if;

  -- 1) categorias exclusivas de empresa
  if (tg_op = 'INSERT' or new.category is distinct from old.category)
     and new.category in ('nf', 'das', 'relatorio', 'contrato', 'extrato_pj') then
    raise exception 'Conta Pessoal (CPF) não aceita documentos de empresa (%).', new.category
      using errcode = 'check_violation';
  end if;

  -- 2) nota fiscal em XML: o CPF do titular precisa ser emitente ou destinatário
  if tg_op = 'INSERT' and new.extracted_data ->> 'fonte' = 'xml' then
    emit_doc := upper(regexp_replace(coalesce(new.extracted_data -> 'emit' ->> 'doc', ''), '[^0-9A-Za-z]', '', 'g'));
    dest_doc := upper(regexp_replace(coalesce(new.extracted_data -> 'dest' ->> 'doc', ''), '[^0-9A-Za-z]', '', 'g'));
    if p.document_type is distinct from 'cpf' or coalesce(p.document_number, '') = ''
       or (p.document_number <> emit_doc and p.document_number <> dest_doc) then
      raise exception 'Nota fiscal não pertence ao CPF cadastrado nesta conta Pessoal.'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists documents_pf_guard on public.documents;
create trigger documents_pf_guard
  before insert or update on public.documents
  for each row execute function public.documents_pf_guard();
