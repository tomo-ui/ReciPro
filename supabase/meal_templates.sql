-- ============================================================================
-- Zapisane posiłki: zestaw dań (np. stałe śniadanie) do wielokrotnego wstawiania w przyszłych dietach.
-- Uruchom w Supabase → SQL Editor PO schema.sql i diets.sql. Plik można uruchamiać wielokrotnie.
-- ============================================================================
--
-- Czysto prywatna, użytkowa lista — bez udostępniania innym (w przeciwieństwie do diets).

create table if not exists public.meal_templates (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 60),
  items      jsonb not null default '[]'::jsonb
             check (jsonb_typeof(items) = 'array' and pg_column_size(items) < 100000),
  created_at timestamptz not null default now()
);

create index if not exists meal_templates_user_idx on public.meal_templates (user_id, created_at desc);

alter table public.meal_templates enable row level security;

-- Tylko własne — to lista roboczych szablonów, nie ma tu udostępniania jak przy dietach
drop policy if exists meal_templates_select on public.meal_templates;
create policy meal_templates_select on public.meal_templates for select to authenticated
  using (user_id = auth.uid());
drop policy if exists meal_templates_insert on public.meal_templates;
create policy meal_templates_insert on public.meal_templates for insert to authenticated with check (user_id = auth.uid());
drop policy if exists meal_templates_update on public.meal_templates;
create policy meal_templates_update on public.meal_templates for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists meal_templates_delete on public.meal_templates;
create policy meal_templates_delete on public.meal_templates for delete to authenticated using (user_id = auth.uid());

-- Bez dostępu dla niezalogowanych; klient nie zmienia właściciela ani daty utworzenia
revoke all on public.meal_templates from anon;
revoke update on public.meal_templates from authenticated;
grant select, insert, delete on public.meal_templates to authenticated;
grant update (name, items) on public.meal_templates to authenticated;
