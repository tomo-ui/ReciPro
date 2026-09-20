-- Zdjęcia profilowe, listy obserwujących, polubienia, komentarze i liczniki na żywo.
-- Uruchom w Supabase → SQL Editor JEDEN raz, PO schema.sql i social.sql. Skrypt jest idempotentny.

-- ---------------------------------------------------------------------------
-- Profile: awatar i liczniki obserwujących
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists avatar_url text;
-- Opis profilu (bio) jak w Instagramie: do 150 znaków, maksymalnie 5 linii
alter table public.profiles add column if not exists bio text;
-- Czy inni mogą powiększyć zdjęcie profilowe dotknięciem (domyślnie tak)
alter table public.profiles add column if not exists allow_avatar_zoom boolean not null default true;
alter table public.profiles drop constraint if exists profiles_bio_valid;
alter table public.profiles add constraint profiles_bio_valid check (
  bio is null or (char_length(bio) <= 150 and array_length(string_to_array(bio, E'\n'), 1) <= 5)
);
alter table public.profiles add column if not exists followers_count int not null default 0;
alter table public.profiles add column if not exists following_count int not null default 0;

-- Awatar może wskazywać tylko plik w NASZYM buckecie, w folderze właściciela profilu
alter table public.profiles drop constraint if exists profiles_avatar_url_valid;
alter table public.profiles add constraint profiles_avatar_url_valid check (
  avatar_url is null or (
    char_length(avatar_url) <= 400
    and avatar_url like 'https://%/storage/v1/object/public/recipe-images/' || id::text || '/%'
  )
);

-- Klient nie może sam ustawiać liczników (ani innych kolumn poza własnymi danymi profilu)
revoke insert, update on public.profiles from anon, authenticated;
grant insert (id, username, full_name, is_public, avatar_url, bio, allow_avatar_zoom) on public.profiles to authenticated;
grant update (username, full_name, is_public, avatar_url, bio, allow_avatar_zoom) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Konta testowe i panel admina: konta oznaczone is_test (dane z supabase/test_accounts.sql) widzi TYLKO admin,
-- który ma je włączone. Dla wszystkich pozostałych nie istnieją: ani profile, ani przepisy, ani wyniki wyszukiwania.
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists is_test boolean not null default false;

create table if not exists public.app_admins (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  show_test_accounts boolean not null default true,
  created_at         timestamptz not null default now()
);
alter table public.app_admins enable row level security;
drop policy if exists app_admins_select on public.app_admins;
create policy app_admins_select on public.app_admins for select to authenticated using (user_id = auth.uid());
drop policy if exists app_admins_update on public.app_admins;
create policy app_admins_update on public.app_admins for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Administratorów dopisuje się tylko w SQL Editorze (brak insertu dla klienta); przełączać wolno tylko widoczność kont testowych
revoke all on public.app_admins from anon, authenticated;
grant select on public.app_admins to authenticated;
grant update (show_test_accounts) on public.app_admins to authenticated;

-- Twórca aplikacji (nazwa użytkownika „tk”) jest adminem; ponowne uruchomienie pliku niczego nie psuje
insert into public.app_admins (user_id) select id from public.profiles where username = 'tk' on conflict do nothing;

-- Czy zalogowany widzi konta testowe (admin z włączoną widocznością)
create or replace function public.can_see_test_accounts() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select a.show_test_accounts from public.app_admins a where a.user_id = auth.uid()), false)
$$;
revoke all on function public.can_see_test_accounts() from public, anon;
grant execute on function public.can_see_test_accounts() to authenticated;

-- Liczba kont testowych w bazie (niezależnie od tego, czy są włączone) — tylko dla admina
create or replace function public.admin_test_account_count() returns int
language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from public.app_admins a where a.user_id = auth.uid())
              then (select count(*)::int from public.profiles p where p.is_test) else 0 end
$$;
revoke all on function public.admin_test_account_count() from public, anon;
grant execute on function public.admin_test_account_count() to authenticated;

-- Profile: wszyscy zalogowani widzą profile, ale nie konta testowe (przepisy kont bez widocznego profilu też znikają,
-- bo polityka przepisów sprawdza profil autora)
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (not is_test or public.can_see_test_accounts());

-- Liczniki utrzymują triggery, dzięki temu Realtime może pokazać zmianę wiersza profilu wszystkim
-- bez ujawniania, kto kogo obserwuje
create or replace function public.follows_update_counts() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set followers_count = followers_count + 1 where id = new.followee_id;
    update public.profiles set following_count = following_count + 1 where id = new.follower_id;
  elsif tg_op = 'DELETE' then
    update public.profiles set followers_count = greatest(followers_count - 1, 0) where id = old.followee_id;
    update public.profiles set following_count = greatest(following_count - 1, 0) where id = old.follower_id;
  end if;
  return null;
end $$;

drop trigger if exists follows_counts on public.follows;
create trigger follows_counts after insert or delete on public.follows
  for each row execute function public.follows_update_counts();

update public.profiles p set
  followers_count = (select count(*) from public.follows f where f.followee_id = p.id),
  following_count = (select count(*) from public.follows f where f.follower_id = p.id);

-- Realtime: klient nasłuchuje zmian wiersza profilu (liczniki). Tabela profiles jest czytelna dla
-- każdego zalogowanego, więc nic nowego nie zostaje ujawnione.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
     ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Funkcje profili (zmieniają zwracane kolumny, więc trzeba je usunąć i utworzyć na nowo)
-- ---------------------------------------------------------------------------

drop function if exists public.get_profile(text);
drop function if exists public.search_profiles(text, int, int);

create function public.get_profile(p_username text)
returns table (
  id uuid, username text, full_name text, avatar_url text, is_public boolean,
  recipe_count int, followers_count int, following_count int, is_following boolean, is_me boolean,
  bio text, allow_avatar_zoom boolean
)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.full_name, p.avatar_url, p.is_public,
    (case when p.is_public or p.id = auth.uid()
          then (select count(*) from public.recipes r where r.user_id = p.id) else 0 end)::int,
    p.followers_count, p.following_count,
    exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = p.id),
    p.id = auth.uid(),
    p.bio, p.allow_avatar_zoom
  from public.profiles p
  where p.username = lower(p_username) and (not p.is_test or public.can_see_test_accounts())
$$;

create function public.search_profiles(p_query text default '', p_limit int default 20, p_offset int default 0)
returns table (
  id uuid, username text, full_name text, avatar_url text, is_public boolean,
  recipe_count int, followers_count int, following_count int, is_following boolean, is_me boolean
)
language sql stable security definer set search_path = public as $$
  with q as (
    select public.search_words(p_query) as words,
           public.f_unaccent(lower(btrim(regexp_replace(coalesce(p_query, ''), '[@]', '', 'g')))) as raw
  )
  select p.id, p.username, p.full_name, p.avatar_url, p.is_public,
    (case when p.is_public or p.id = auth.uid()
          then (select count(*) from public.recipes r where r.user_id = p.id) else 0 end)::int,
    p.followers_count, p.following_count,
    exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = p.id),
    p.id = auth.uid()
  from public.profiles p cross join q
  where (not p.is_test or public.can_see_test_accounts()) and not exists (
    select 1 from unnest(q.words) as w
    where public.f_unaccent(lower(p.username || ' ' || coalesce(p.full_name, ''))) not like '%' || w || '%' escape '\'
  )
  order by
    (p.username = q.raw) desc,
    (p.username like public.like_escape(q.raw) || '%' escape '\') desc,
    p.followers_count desc,
    p.username
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0)
$$;

-- Lista obserwujących profilu. Lista profilu prywatnego jest widoczna tylko dla jego właściciela.
create or replace function public.list_followers(p_username text, p_limit int default 30, p_offset int default 0)
returns table (
  id uuid, username text, full_name text, avatar_url text, is_public boolean,
  recipe_count int, followers_count int, following_count int, is_following boolean, is_me boolean
)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.full_name, p.avatar_url, p.is_public,
    (case when p.is_public or p.id = auth.uid()
          then (select count(*) from public.recipes r where r.user_id = p.id) else 0 end)::int,
    p.followers_count, p.following_count,
    exists (select 1 from public.follows x where x.follower_id = auth.uid() and x.followee_id = p.id),
    p.id = auth.uid()
  from public.profiles target
  join public.follows f on f.followee_id = target.id
  join public.profiles p on p.id = f.follower_id
  where target.username = lower(p_username) and (target.is_public or target.id = auth.uid())
    and (not target.is_test or public.can_see_test_accounts()) and (not p.is_test or public.can_see_test_accounts())
  order by f.created_at desc, p.username
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0)
$$;

-- Lista osób, które profil obserwuje (te same zasady prywatności)
create or replace function public.list_following(p_username text, p_limit int default 30, p_offset int default 0)
returns table (
  id uuid, username text, full_name text, avatar_url text, is_public boolean,
  recipe_count int, followers_count int, following_count int, is_following boolean, is_me boolean
)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.full_name, p.avatar_url, p.is_public,
    (case when p.is_public or p.id = auth.uid()
          then (select count(*) from public.recipes r where r.user_id = p.id) else 0 end)::int,
    p.followers_count, p.following_count,
    exists (select 1 from public.follows x where x.follower_id = auth.uid() and x.followee_id = p.id),
    p.id = auth.uid()
  from public.profiles target
  join public.follows f on f.follower_id = target.id
  join public.profiles p on p.id = f.followee_id
  where target.username = lower(p_username) and (target.is_public or target.id = auth.uid())
    and (not target.is_test or public.can_see_test_accounts()) and (not p.is_test or public.can_see_test_accounts())
  order by f.created_at desc, p.username
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0)
$$;

-- ---------------------------------------------------------------------------
-- Zainteresowania (prywatne): tagi i słowa, które użytkownik lubi; wpływają na feed Dla Ciebie
-- ---------------------------------------------------------------------------

create or replace function public.interests_valid(p_list text[]) returns boolean
language sql immutable as $$
  select cardinality(coalesce(p_list, '{}')) <= 30
     and not exists (select 1 from unnest(coalesce(p_list, '{}')) i where char_length(i) not between 1 and 30)
$$;

create table if not exists public.user_interests (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  interests  text[] not null default '{}',
  updated_at timestamptz not null default now(),
  constraint user_interests_valid check (public.interests_valid(interests))
);

alter table public.user_interests enable row level security;
drop policy if exists user_interests_select on public.user_interests;
create policy user_interests_select on public.user_interests for select to authenticated using (user_id = auth.uid());
drop policy if exists user_interests_insert on public.user_interests;
create policy user_interests_insert on public.user_interests for insert to authenticated with check (user_id = auth.uid());
drop policy if exists user_interests_update on public.user_interests;
create policy user_interests_update on public.user_interests for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.user_interests from anon;
revoke all on public.user_interests from authenticated;
grant select, insert, update on public.user_interests to authenticated;

-- ---------------------------------------------------------------------------
-- Wyszukiwanie i feed: autor razem ze zdjęciem profilowym
-- ---------------------------------------------------------------------------

drop function if exists public.search_recipes(text, text, int, int);
drop function if exists public.feed(text, text, int, int);

create function public.search_recipes(
  p_query text default '', p_sort text default 'relevance', p_limit int default 20, p_offset int default 0
) returns table (
  id uuid, user_id uuid, title text, description text, image_url text, source_url text,
  servings int, prep_minutes int, cook_minutes int, total_minutes int,
  ingredients jsonb, steps jsonb, tags text[], parse_method text,
  created_at timestamptz, updated_at timestamptz,
  author_username text, author_full_name text, author_avatar_url text
)
language sql stable set search_path = public as $$
  with q as (select public.search_words(p_query) as words)
  select r.id, r.user_id, r.title, r.description, r.image_url, r.source_url,
         r.servings, r.prep_minutes, r.cook_minutes, r.total_minutes,
         r.ingredients, r.steps, r.tags, r.parse_method, r.created_at, r.updated_at,
         p.username, p.full_name, p.avatar_url
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

-- ---------------------------------------------------------------------------
-- Polubienia
-- ---------------------------------------------------------------------------

create table if not exists public.recipe_likes (
  recipe_id  uuid not null references public.recipes (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (recipe_id, user_id)
);
create index if not exists recipe_likes_user_idx on public.recipe_likes (user_id, created_at desc);

alter table public.recipe_likes enable row level security;

-- Polubienia widać i można dawać tylko pod przepisami, które samemu się widzi
-- (podzapytanie do recipes podlega jego RLS, więc prywatne profile są automatycznie wykluczone)
drop policy if exists recipe_likes_select on public.recipe_likes;
create policy recipe_likes_select on public.recipe_likes for select to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_likes.recipe_id));
drop policy if exists recipe_likes_insert on public.recipe_likes;
create policy recipe_likes_insert on public.recipe_likes for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.recipes r where r.id = recipe_likes.recipe_id));
drop policy if exists recipe_likes_delete on public.recipe_likes;
create policy recipe_likes_delete on public.recipe_likes for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Feed Dla Ciebie (po tabelach obserwowania i polubień, z których korzysta)
-- ---------------------------------------------------------------------------

create function public.feed(
  p_mode text default 'foryou', p_seed text default '', p_limit int default 12, p_offset int default 0
) returns table (
  id uuid, user_id uuid, title text, description text, image_url text, source_url text,
  servings int, prep_minutes int, cook_minutes int, total_minutes int,
  ingredients jsonb, steps jsonb, tags text[], parse_method text,
  created_at timestamptz, updated_at timestamptz,
  author_username text, author_full_name text, author_avatar_url text, author_followed boolean
)
language sql stable set search_path = public as $$
  -- „newest”: chronologicznie przepisy obserwowanych. Każdy inny tryb („foryou”) to feed Dla Ciebie:
  --  1) najpierw przepisy obserwowanych oraz polecane od kont, które pasują do zainteresowań i polubień
  --     (kolejność: dopasowanie + świeżość + odrobina losowości zależnej od ziarna),
  --  2) potem reszta publicznych przepisów, od najnowszych.
  with me as (
    select coalesce(
      (select array_agg(public.f_unaccent(lower(i))) from unnest(ui.interests) i), '{}'::text[]
    ) as interests
    from (select 1) one
    left join public.user_interests ui on ui.user_id = auth.uid()
  ),
  liked as (
    select public.f_unaccent(lower(t)) as tag, least(count(*), 3)::numeric as weight
    from public.recipe_likes l
    join public.recipes lr on lr.id = l.recipe_id
    cross join lateral unnest(lr.tags) t
    where l.user_id = auth.uid()
    group by 1
  ),
  cand as (
    select r.*, p.username as a_username, p.full_name as a_full_name, p.avatar_url as a_avatar_url,
           exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = r.user_id) as followed
    from public.recipes r
    join public.profiles p on p.id = r.user_id
    where r.user_id <> auth.uid()
  ),
  scored as (
    select c.*,
      (
        (select count(*) from unnest(c.tags) t, me where public.f_unaccent(lower(t)) = any (me.interests)) * 3
        + (select count(*) from me, unnest(me.interests) i where i <> '' and strpos(public.f_unaccent(lower(c.title)), i) > 0) * 2
        + coalesce((select sum(lk.weight) from liked lk where lk.tag in (select public.f_unaccent(lower(t)) from unnest(c.tags) t)), 0)
      )::numeric as match_score
    from cand c
  )
  select s.id, s.user_id, s.title, s.description, s.image_url, s.source_url,
         s.servings, s.prep_minutes, s.cook_minutes, s.total_minutes,
         s.ingredients, s.steps, s.tags, s.parse_method, s.created_at, s.updated_at,
         s.a_username, s.a_full_name, s.a_avatar_url, s.followed
  from scored s
  where p_mode <> 'newest' or s.followed
  order by
    case when p_mode = 'newest' then 0 when s.followed or s.match_score > 0 then 0 else 1 end,
    case when p_mode = 'newest' or not (s.followed or s.match_score > 0) then extract(epoch from s.created_at) end desc nulls last,
    ((case when s.followed then 2 else 0 end) + s.match_score
      + get_byte(decode(substr(md5(s.id::text || coalesce(p_seed, '')), 1, 2), 'hex'), 0) / 255.0 * 1.5
      + 2 * exp(-greatest(0, extract(epoch from (date_trunc('hour', now()) - s.created_at))) / 1209600.0)) desc,
    s.id
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0)
$$;

-- ---------------------------------------------------------------------------
-- Komentarze
-- ---------------------------------------------------------------------------

create table if not exists public.recipe_comments (
  id         uuid primary key default gen_random_uuid(),
  recipe_id  uuid not null references public.recipes (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body       text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists recipe_comments_recipe_idx on public.recipe_comments (recipe_id, created_at desc);

alter table public.recipe_comments enable row level security;

drop policy if exists recipe_comments_select on public.recipe_comments;
create policy recipe_comments_select on public.recipe_comments for select to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_comments.recipe_id));
drop policy if exists recipe_comments_insert on public.recipe_comments;
create policy recipe_comments_insert on public.recipe_comments for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.recipes r where r.id = recipe_comments.recipe_id));
-- Usunąć komentarz może jego autor oraz autor przepisu, pod którym został dodany
drop policy if exists recipe_comments_delete on public.recipe_comments;
create policy recipe_comments_delete on public.recipe_comments for delete to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.recipes r where r.id = recipe_comments.recipe_id and r.user_id = auth.uid())
  );
-- Bez edycji komentarzy (brak polityki UPDATE)

-- Liczba polubień i komentarzy, to czy ja polubiłem, oraz ostatni komentarz z autorem (dla listy przepisów naraz).
-- Zmienia zwracane kolumny, więc funkcję trzeba usunąć i utworzyć na nowo.
drop function if exists public.recipe_stats(uuid[]);
create function public.recipe_stats(p_ids uuid[])
returns table (
  recipe_id uuid, like_count int, comment_count int, liked boolean,
  last_comment_id uuid, last_comment_body text, last_comment_at timestamptz,
  last_comment_username text, last_comment_avatar_url text
)
language sql stable set search_path = public as $$
  select i.id,
    (select count(*) from public.recipe_likes l where l.recipe_id = i.id)::int,
    (select count(*) from public.recipe_comments c where c.recipe_id = i.id)::int,
    exists (select 1 from public.recipe_likes l where l.recipe_id = i.id and l.user_id = auth.uid()),
    lc.id, lc.body, lc.created_at, lc.username, lc.avatar_url
  from unnest(p_ids[1:100]) as i(id)
  left join lateral (
    select c.id, c.body, c.created_at, p.username, p.avatar_url
    from public.recipe_comments c
    join public.profiles p on p.id = c.user_id
    where c.recipe_id = i.id
    order by c.created_at desc, c.id
    limit 1
  ) lc on true
$$;

-- Komentarze pod przepisem z danymi autora, od najnowszych
create or replace function public.list_comments(p_recipe uuid, p_limit int default 20, p_offset int default 0)
returns table (
  id uuid, recipe_id uuid, user_id uuid, body text, created_at timestamptz,
  author_username text, author_full_name text, author_avatar_url text
)
language sql stable set search_path = public as $$
  select c.id, c.recipe_id, c.user_id, c.body, c.created_at, p.username, p.full_name, p.avatar_url
  from public.recipe_comments c
  join public.profiles p on p.id = c.user_id
  where c.recipe_id = p_recipe
  order by c.created_at desc, c.id
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0)
$$;

-- ---------------------------------------------------------------------------
-- Uprawnienia do funkcji: tylko zalogowani
-- ---------------------------------------------------------------------------

revoke all on function public.get_profile(text) from public, anon;
revoke all on function public.search_profiles(text, int, int) from public, anon;
revoke all on function public.list_followers(text, int, int) from public, anon;
revoke all on function public.list_following(text, int, int) from public, anon;
revoke all on function public.search_recipes(text, text, int, int) from public, anon;
revoke all on function public.feed(text, text, int, int) from public, anon;
revoke all on function public.recipe_stats(uuid[]) from public, anon;
revoke all on function public.list_comments(uuid, int, int) from public, anon;
grant execute on function public.get_profile(text) to authenticated;
grant execute on function public.search_profiles(text, int, int) to authenticated;
grant execute on function public.list_followers(text, int, int) to authenticated;
grant execute on function public.list_following(text, int, int) to authenticated;
grant execute on function public.search_recipes(text, text, int, int) to authenticated;
grant execute on function public.feed(text, text, int, int) to authenticated;
grant execute on function public.recipe_stats(uuid[]) to authenticated;
grant execute on function public.list_comments(uuid, int, int) to authenticated;
