-- ============================================================================
-- Diety: rozpisane na posiłki, z celami żywieniowymi; można je udostępniać i zapisywać sobie od innych.
-- Uruchom w Supabase → SQL Editor PO schema.sql i social.sql (kolejność względem engagement/notifications bez znaczenia).
-- Plik można uruchamiać wielokrotnie.
-- ============================================================================
--
-- Dieta to jeden dokument: posiłki (`meals`) z daniami i ich składnikami oraz cele dzienne (`targets`).
-- Składniki są kopią z chwili dodania dania, dzięki czemu zmiany w diecie (gramatury, porcje) nie ruszają
-- oryginalnych przepisów, a dieta zapisana od innej osoby jest niezależna od tego, co ta osoba potem zmieni.
-- `source` mówi, od kogo pochodzi kopia.

create table if not exists public.diets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 1 and 120),
  description text check (description is null or char_length(description) <= 1000),
  meals       jsonb not null default '[]'::jsonb
              check (jsonb_typeof(meals) = 'array' and pg_column_size(meals) < 300000),
  targets     jsonb not null default '{}'::jsonb check (jsonb_typeof(targets) = 'object'),
  is_public   boolean not null default false,
  source      jsonb check (source is null or jsonb_typeof(source) = 'object'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists diets_user_idx on public.diets (user_id, updated_at desc);

drop trigger if exists diets_set_updated_at on public.diets;
create trigger diets_set_updated_at before update on public.diets
  for each row execute function public.set_updated_at();

alter table public.diets enable row level security;

-- Widać własne diety oraz te, które właściciel udostępnił i ma profil publiczny
drop policy if exists diets_select on public.diets;
create policy diets_select on public.diets for select to authenticated
  using (
    user_id = auth.uid()
    or (is_public and exists (select 1 from public.profiles p where p.id = diets.user_id and p.is_public))
  );
drop policy if exists diets_insert on public.diets;
create policy diets_insert on public.diets for insert to authenticated with check (user_id = auth.uid());
drop policy if exists diets_update on public.diets;
create policy diets_update on public.diets for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists diets_delete on public.diets;
create policy diets_delete on public.diets for delete to authenticated using (user_id = auth.uid());

-- Bez dostępu dla niezalogowanych; klient nie zmienia właściciela ani dat
revoke all on public.diets from anon;
revoke update on public.diets from authenticated;
grant select, insert, delete on public.diets to authenticated;
grant update (title, description, meals, targets, is_public, source) on public.diets to authenticated;
