-- Profile, obserwowanie, wyszukiwanie, feed i porządki w zdjęciach.
-- Uruchom w Supabase → SQL Editor JEDEN raz (po schema.sql). Skrypt jest idempotentny —
-- można go bezpiecznie uruchomić ponownie po każdej zmianie.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------------------
-- Funkcje pomocnicze
-- ---------------------------------------------------------------------------

-- unaccent bez polskich ogonków (ł → l, ż → z…); wrapper IMMUTABLE, żeby dało się go użyć w indeksach
create or replace function public.f_unaccent(t text) returns text
language sql immutable parallel safe strict
as $$ select extensions.unaccent('extensions.unaccent'::regdictionary, t) $$;

-- Escapowanie znaków specjalnych LIKE (% _ \)
create or replace function public.like_escape(t text) returns text
language sql immutable parallel safe strict
as $$ select replace(replace(replace(t, '\', '\\'), '%', '\%'), '_', '\_') $$;

-- Reguły nazwy użytkownika jak na Instagramie: 1–30 znaków, litery a–z (bez rozróżniania wielkości),
-- cyfry, kropka i podkreślnik; kropka nie na początku, nie na końcu i nie dwie pod rząd.
create or replace function public.is_valid_username(u text) returns boolean
language sql immutable parallel safe
as $$
  select u is not null
     and u ~ '^[a-z0-9_]([a-z0-9_.]{0,28}[a-z0-9_])?$'
     and u !~ '\.\.'
     and u <> all (array[
       'admin', 'administrator', 'api', 'root', 'support', 'help', 'settings', 'explore', 'feed',
       'search', 'profile', 'profiles', 'przepisy', 'recipe', 'recipes', 'null', 'undefined'
     ])
$$;

-- Słowa zapytania: małe litery, bez ogonków, bez # i @, gotowe do LIKE ... ESCAPE '\'
create or replace function public.search_words(q text) returns text[]
language sql immutable parallel safe
as $$
  select coalesce(array_agg(public.like_escape(w)), '{}'::text[])
  from unnest(regexp_split_to_array(
         public.f_unaccent(lower(btrim(regexp_replace(coalesce(q, ''), '[#@]', ' ', 'g')))), '\s+')) as w
  where w <> ''
$$;

-- ---------------------------------------------------------------------------
-- Profile
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text not null,
  full_name   text,
  is_public   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint profiles_username_valid check (public.is_valid_username(username)),
  constraint profiles_full_name_len check (full_name is null or char_length(full_name) <= 60)
);

create unique index if not exists profiles_username_key on public.profiles (username);
create index if not exists profiles_search_idx on public.profiles
  using gin (public.f_unaccent(lower(username || ' ' || coalesce(full_name, ''))) extensions.gin_trgm_ops);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

-- Każdy zalogowany widzi profile (nazwa, imię i nazwisko) — jak w wyszukiwarce Instagrama.
-- Widoczność PRZEPISÓW zależy od is_public (patrz polityka recipes niżej).
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (true);
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Sprawdzanie dostępności nazwy podczas rejestracji (jeszcze bez sesji, więc także dla anon)
create or replace function public.username_available(p_username text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_valid_username(lower(p_username))
     and not exists (select 1 from public.profiles where username = lower(p_username))
$$;
revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Obserwowanie
-- ---------------------------------------------------------------------------

create table if not exists public.follows (
  follower_id uuid not null references auth.users (id) on delete cascade,
  followee_id uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint follows_not_self check (follower_id <> followee_id)
);
create index if not exists follows_followee_idx on public.follows (followee_id);

alter table public.follows enable row level security;
-- Widzisz tylko relacje, w których uczestniczysz; liczniki liczą funkcje SECURITY DEFINER niżej
drop policy if exists follows_select on public.follows;
create policy follows_select on public.follows for select to authenticated
  using (follower_id = auth.uid() or followee_id = auth.uid());
drop policy if exists follows_insert on public.follows;
create policy follows_insert on public.follows for insert to authenticated with check (follower_id = auth.uid());
drop policy if exists follows_delete on public.follows;
create policy follows_delete on public.follows for delete to authenticated using (follower_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Przepisy: widoczność i wyszukiwanie
-- ---------------------------------------------------------------------------

alter table public.recipes add column if not exists search_text text not null default '';

create or replace function public.recipes_build_search_text() returns trigger
language plpgsql set search_path = public as $$
begin
  new.search_text := public.f_unaccent(lower(
    coalesce(new.title, '') || ' ' || coalesce(new.description, '') || ' ' ||
    coalesce(array_to_string(new.tags, ' '), '') || ' ' ||
    coalesce((select string_agg(e ->> 'text', ' ') from jsonb_array_elements(new.ingredients) as e), '')
  ));
  return new;
end $$;

drop trigger if exists recipes_search_text on public.recipes;
create trigger recipes_search_text before insert or update of title, description, tags, ingredients
  on public.recipes for each row execute function public.recipes_build_search_text();

create index if not exists recipes_search_idx on public.recipes using gin (search_text extensions.gin_trgm_ops);
create index if not exists recipes_created_idx on public.recipes (created_at desc);

-- Uzupełnienie istniejących przepisów (wyzwala trigger)
update public.recipes set title = title where search_text = '';

-- Przepis widzi: jego autor ORAZ każdy zalogowany, jeśli profil autora jest publiczny
drop policy if exists recipes_select_own on public.recipes;
drop policy if exists recipes_select_visible on public.recipes;
create policy recipes_select_visible on public.recipes for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = recipes.user_id and p.is_public)
  );

-- ---------------------------------------------------------------------------
-- Funkcje (RPC) wywoływane z aplikacji
-- ---------------------------------------------------------------------------

-- Wyszukiwanie przepisów w profilach publicznych (i własnych): tytuł, opis, tagi, składniki.
-- Wszystkie słowa muszą wystąpić; trafienie w tytuł i tagi podnosi wynik. RLS zostaje włączone (INVOKER).
create or replace function public.search_recipes(
  p_query text default '', p_sort text default 'relevance', p_limit int default 20, p_offset int default 0
) returns table (
  id uuid, user_id uuid, title text, description text, image_url text, source_url text,
  servings int, prep_minutes int, cook_minutes int, total_minutes int,
  ingredients jsonb, steps jsonb, tags text[], parse_method text,
  created_at timestamptz, updated_at timestamptz, author_username text, author_full_name text
)
language sql stable set search_path = public as $$
  with q as (select public.search_words(p_query) as words)
  select r.id, r.user_id, r.title, r.description, r.image_url, r.source_url,
         r.servings, r.prep_minutes, r.cook_minutes, r.total_minutes,
         r.ingredients, r.steps, r.tags, r.parse_method, r.created_at, r.updated_at,
         p.username, p.full_name
  from public.recipes r
  join public.profiles p on p.id = r.user_id
  cross join q
  where not exists (
    select 1 from unnest(q.words) as w where r.search_text not like '%' || w || '%' escape '\'
  )
  order by
    case when p_sort = 'newest' then null else -(
      (select count(*) from unnest(q.words) as w
        where public.f_unaccent(lower(r.title)) like '%' || w || '%' escape '\') * 3
      + (select count(*) from unnest(q.words) as w
        where public.f_unaccent(lower(array_to_string(r.tags, ' '))) like '%' || w || '%' escape '\') * 2
    ) end,
    r.created_at desc, r.id
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0)
$$;

-- Feed: przepisy osób, które obserwujesz. 'random' = losowa, ale stabilna kolejność dla danego ziarna
-- (stronicowanie nie powtarza pozycji), 'newest' = od najnowszych.
create or replace function public.feed(
  p_mode text default 'random', p_seed text default '', p_limit int default 12, p_offset int default 0
) returns table (
  id uuid, user_id uuid, title text, description text, image_url text, source_url text,
  servings int, prep_minutes int, cook_minutes int, total_minutes int,
  ingredients jsonb, steps jsonb, tags text[], parse_method text,
  created_at timestamptz, updated_at timestamptz, author_username text, author_full_name text
)
language sql stable set search_path = public as $$
  select r.id, r.user_id, r.title, r.description, r.image_url, r.source_url,
         r.servings, r.prep_minutes, r.cook_minutes, r.total_minutes,
         r.ingredients, r.steps, r.tags, r.parse_method, r.created_at, r.updated_at,
         p.username, p.full_name
  from public.recipes r
  join public.follows f on f.followee_id = r.user_id and f.follower_id = auth.uid()
  join public.profiles p on p.id = r.user_id
  order by
    case when p_mode = 'newest' then extract(epoch from r.created_at) end desc nulls last,
    md5(r.id::text || coalesce(p_seed, '')), r.id
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0)
$$;

-- Najczęstsze tagi w widocznych przepisach (podpowiedzi w wyszukiwarce)
create or replace function public.popular_tags(p_limit int default 20)
returns table (tag text, uses int)
language sql stable set search_path = public as $$
  select t, count(*)::int
  from public.recipes r cross join lateral unnest(r.tags) as t
  group by t
  order by 2 desc, 1
  limit least(greatest(p_limit, 1), 50)
$$;

-- Profil z licznikami. SECURITY DEFINER, bo liczba obserwujących wymaga ominięcia RLS na follows;
-- liczba przepisów uwzględnia prywatność profilu.
create or replace function public.get_profile(p_username text)
returns table (
  id uuid, username text, full_name text, is_public boolean,
  recipe_count int, followers_count int, following_count int, is_following boolean, is_me boolean
)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.full_name, p.is_public,
    (case when p.is_public or p.id = auth.uid()
          then (select count(*) from public.recipes r where r.user_id = p.id) else 0 end)::int,
    (select count(*) from public.follows f where f.followee_id = p.id)::int,
    (select count(*) from public.follows f where f.follower_id = p.id)::int,
    exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = p.id),
    p.id = auth.uid()
  from public.profiles p
  where p.username = lower(p_username)
$$;

-- Wyszukiwanie osób po nazwie użytkownika albo imieniu i nazwisku (bez rozróżniania ogonków i wielkości liter)
create or replace function public.search_profiles(p_query text default '', p_limit int default 20, p_offset int default 0)
returns table (
  id uuid, username text, full_name text, is_public boolean,
  recipe_count int, followers_count int, following_count int, is_following boolean, is_me boolean
)
language sql stable security definer set search_path = public as $$
  with q as (
    select public.search_words(p_query) as words,
           public.f_unaccent(lower(btrim(regexp_replace(coalesce(p_query, ''), '[@]', '', 'g')))) as raw
  )
  select p.id, p.username, p.full_name, p.is_public,
    (case when p.is_public or p.id = auth.uid()
          then (select count(*) from public.recipes r where r.user_id = p.id) else 0 end)::int,
    (select count(*) from public.follows f where f.followee_id = p.id)::int,
    (select count(*) from public.follows f where f.follower_id = p.id)::int,
    exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = p.id),
    p.id = auth.uid()
  from public.profiles p cross join q
  where not exists (
    select 1 from unnest(q.words) as w
    where public.f_unaccent(lower(p.username || ' ' || coalesce(p.full_name, ''))) not like '%' || w || '%' escape '\'
  )
  order by
    (p.username = q.raw) desc,
    (p.username like public.like_escape(q.raw) || '%' escape '\') desc,
    (select count(*) from public.follows f where f.followee_id = p.id) desc,
    p.username
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0)
$$;

revoke all on function public.get_profile(text) from public, anon;
grant execute on function public.get_profile(text) to authenticated;
revoke all on function public.search_profiles(text, int, int) from public, anon;
grant execute on function public.search_profiles(text, int, int) to authenticated;
grant execute on function public.search_recipes(text, text, int, int) to authenticated;
grant execute on function public.feed(text, text, int, int) to authenticated;
grant execute on function public.popular_tags(int) to authenticated;

-- ---------------------------------------------------------------------------
-- Zdjęcia przepisów (Storage): zapis i usuwanie tylko we własnym folderze <user_id>/…
-- Polityka SELECT jest potrzebna, żeby usuwanie i podmiana zdjęć w ogóle działały
-- (bucket jest publiczny, więc odczyt obrazów w <img> i tak nie wymaga logowania).
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-images', 'recipe-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists recipe_images_select on storage.objects;
create policy recipe_images_select on storage.objects for select to authenticated
  using (bucket_id = 'recipe-images');

drop policy if exists recipe_images_insert_own on storage.objects;
create policy recipe_images_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'recipe-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists recipe_images_delete_own on storage.objects;
create policy recipe_images_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'recipe-images' and (storage.foldername(name))[1] = auth.uid()::text);
