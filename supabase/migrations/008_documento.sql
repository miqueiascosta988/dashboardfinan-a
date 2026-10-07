-- 008: CPF/CNPJ no cadastro (somente dígitos/letras, sem máscara) + dados consultados do CNPJ
alter table public.profiles add column if not exists document_type text;
alter table public.profiles add column if not exists document_number text;
alter table public.profiles add column if not exists cnpj_data jsonb;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_document_type_check') then
    alter table public.profiles add constraint profiles_document_type_check check (document_type is null or document_type in ('cpf','cnpj'));
  end if;
end $$;
create index if not exists profiles_document_number_idx on public.profiles (document_number);
