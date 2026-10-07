-- 011: preferências/respostas do usuário sincronizadas com a conta
create table if not exists public.user_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.user_prefs enable row level security;
drop policy if exists user_prefs_select on public.user_prefs;
drop policy if exists user_prefs_insert on public.user_prefs;
drop policy if exists user_prefs_update on public.user_prefs;
create policy user_prefs_select on public.user_prefs for select using (auth.uid() = user_id);
create policy user_prefs_insert on public.user_prefs for insert with check (auth.uid() = user_id);
create policy user_prefs_update on public.user_prefs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
