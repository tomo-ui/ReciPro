-- ============================================================================
-- Znaczki weryfikacji: niebieski (zwykła weryfikacja), złoty (twórca aplikacji), różowy (tester aplikacji),
-- fioletowy (znaczenie do ustalenia). Przyznaje admin z panelu w Ustawieniach, po wyszukaniu użytkownika.
-- Uruchom w Supabase → SQL Editor PO engagement.sql, likers.sql, trending.sql, notifications.sql, comment_likes.sql
-- i moderation.sql (ten plik na nowo definiuje kilka ich funkcji, żeby dopisać kolumnę ze znaczkiem; funkcje SECURITY DEFINER
-- mają tu też filtr blokad z moderation.sql, bo RLS ich nie obejmuje). Plik jest idempotentny.
-- ============================================================================

alter table public.profiles
  add column if not exists verified_badge text
  check (verified_badge in ('blue', 'gold', 'pink', 'purple'));

-- Dotychczasowy jedyny znaczek (niebiesko-gradientowa pieczęć twórcy, gate przez isCreator) staje się złotym tierem
update public.profiles set verified_badge = 'gold' where username = 'tk' and verified_badge is null;

-- Czy zalogowany jest adminem — używane po stronie klienta do pokazania panelu admina
create or replace function public.is_app_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_admins a where a.user_id = auth.uid())
$$;
revoke all on function public.is_app_admin() from public, anon;
grant execute on function public.is_app_admin() to authenticated;

-- Przyznanie/odebranie znaczka — tylko admin
create or replace function public.admin_set_verified_badge(p_username text, p_badge text)
returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not exists (select 1 from public.app_admins a where a.user_id = auth.uid()) then
    raise exception 'permission denied';
  end if;
  if p_badge is not null and p_badge not in ('blue', 'gold', 'pink', 'purple') then
    raise exception 'invalid badge';
  end if;
  update public.profiles set verified_badge = p_badge where username = lower(p_username);
  if not found then
    raise exception 'user not found';
  end if;
end;
$$;
revoke all on function public.admin_set_verified_badge(text, text) from public, anon;
grant execute on function public.admin_set_verified_badge(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Funkcje profili (engagement.sql) — dopisujemy verified_badge, zmienia to zwracane kolumny
-- ---------------------------------------------------------------------------

drop function if exists public.get_profile(text);
create function public.get_profile(p_username text)
returns table (
  id uuid, username text, full_name text, avatar_url text, is_public boolean,
  recipe_count int, followers_count int, following_count int, is_following boolean, is_me boolean,
  bio text, allow_avatar_zoom boolean, website text, verified_badge text
)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.full_name, p.avatar_url, p.is_public,
    (case when p.is_public or p.id = auth.uid()
          then (select count(*) from public.recipes r where r.user_id = p.id and r.is_post) else 0 end)::int,
    p.followers_count, p.following_count,
    exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = p.id),
    p.id = auth.uid(),
    p.bio, p.allow_avatar_zoom, p.website, p.verified_badge
  from public.profiles p
  where p.username = lower(p_username) and (not p.is_test or public.can_see_test_accounts())
    and not public.is_blocked_between(auth.uid(), p.id)
$$;

drop function if exists public.search_profiles(text, int, int);
create function public.search_profiles(p_query text default '', p_limit int default 20, p_offset int default 0)
returns table (
  id uuid, username text, full_name text, avatar_url text, is_public boolean,
  recipe_count int, followers_count int, following_count int, is_following boolean, is_me boolean,
  verified_badge text
)
language sql stable security definer set search_path = public as $$
  with q as (
    select public.search_words(p_query) as words,
           public.f_unaccent(lower(btrim(regexp_replace(coalesce(p_query, ''), '[@]', '', 'g')))) as raw
  )
  select p.id, p.username, p.full_name, p.avatar_url, p.is_public,
    (case when p.is_public or p.id = auth.uid()
          then (select count(*) from public.recipes r where r.user_id = p.id and r.is_post) else 0 end)::int,
    p.followers_count, p.following_count,
    exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = p.id),
    p.id = auth.uid(),
    p.verified_badge
  from public.profiles p cross join q
  where (not p.is_test or public.can_see_test_accounts()) and not public.is_blocked_between(auth.uid(), p.id) and not exists (
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

drop function if exists public.list_followers(text, int, int);
create function public.list_followers(p_username text, p_limit int default 30, p_offset int default 0)
returns table (
  id uuid, username text, full_name text, avatar_url text, is_public boolean,
  recipe_count int, followers_count int, following_count int, is_following boolean, is_me boolean,
  verified_badge text
)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.full_name, p.avatar_url, p.is_public,
    (case when p.is_public or p.id = auth.uid()
          then (select count(*) from public.recipes r where r.user_id = p.id and r.is_post) else 0 end)::int,
    p.followers_count, p.following_count,
    exists (select 1 from public.follows x where x.follower_id = auth.uid() and x.followee_id = p.id),
    p.id = auth.uid(),
    p.verified_badge
  from public.profiles target
  join public.follows f on f.followee_id = target.id
  join public.profiles p on p.id = f.follower_id
  where target.username = lower(p_username) and (target.is_public or target.id = auth.uid())
    and (not target.is_test or public.can_see_test_accounts()) and (not p.is_test or public.can_see_test_accounts())
    and not public.is_blocked_between(auth.uid(), target.id) and not public.is_blocked_between(auth.uid(), p.id)
  order by f.created_at desc, p.username
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0)
$$;

drop function if exists public.list_following(text, int, int);
create function public.list_following(p_username text, p_limit int default 30, p_offset int default 0)
returns table (
  id uuid, username text, full_name text, avatar_url text, is_public boolean,
  recipe_count int, followers_count int, following_count int, is_following boolean, is_me boolean,
  verified_badge text
)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.full_name, p.avatar_url, p.is_public,
    (case when p.is_public or p.id = auth.uid()
          then (select count(*) from public.recipes r where r.user_id = p.id and r.is_post) else 0 end)::int,
    p.followers_count, p.following_count,
    exists (select 1 from public.follows x where x.follower_id = auth.uid() and x.followee_id = p.id),
    p.id = auth.uid(),
    p.verified_badge
  from public.profiles target
  join public.follows f on f.follower_id = target.id
  join public.profiles p on p.id = f.followee_id
  where target.username = lower(p_username) and (target.is_public or target.id = auth.uid())
    and (not target.is_test or public.can_see_test_accounts()) and (not p.is_test or public.can_see_test_accounts())
    and not public.is_blocked_between(auth.uid(), target.id) and not public.is_blocked_between(auth.uid(), p.id)
  order by f.created_at desc, p.username
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0)
$$;

-- `drop function` usuwa też wcześniejsze uprawnienia (engagement.sql je nadawał zbiorczo na końcu pliku) —
-- musimy je nadać na nowo, inaczej świeżo utworzona funkcja dziedziczy domyślne uprawnienia (widoczna dla anon)
revoke all on function public.get_profile(text) from public, anon;
revoke all on function public.search_profiles(text, int, int) from public, anon;
revoke all on function public.list_followers(text, int, int) from public, anon;
revoke all on function public.list_following(text, int, int) from public, anon;
grant execute on function public.get_profile(text) to authenticated;
grant execute on function public.search_profiles(text, int, int) to authenticated;
grant execute on function public.list_followers(text, int, int) to authenticated;
grant execute on function public.list_following(text, int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Wyszukiwanie i feed przepisów (engagement.sql) — autor dostaje author_verified_badge
-- ---------------------------------------------------------------------------

drop function if exists public.search_recipes(text, text, int, int);
create function public.search_recipes(
  p_query text default '', p_sort text default 'relevance', p_limit int default 20, p_offset int default 0
) returns table (
  id uuid, user_id uuid, title text, description text, image_url text, source_url text,
  servings int, prep_minutes int, cook_minutes int, total_minutes int,
  ingredients jsonb, steps jsonb, tags text[], parse_method text,
  created_at timestamptz, updated_at timestamptz,
  author_username text, author_full_name text, author_avatar_url text, author_verified_badge text
)
language sql stable set search_path = public as $$
  with q as (select public.search_words(p_query) as words)
  select r.id, r.user_id, r.title, r.description, r.image_url, r.source_url,
         r.servings, r.prep_minutes, r.cook_minutes, r.total_minutes,
         r.ingredients, r.steps, r.tags, r.parse_method, r.created_at, r.updated_at,
         p.username, p.full_name, p.avatar_url, p.verified_badge
  from public.recipes r
  join public.profiles p on p.id = r.user_id
  cross join q
  where r.is_post and not exists (
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

drop function if exists public.feed(text, text, int, int);
create function public.feed(
  p_mode text default 'foryou', p_seed text default '', p_limit int default 12, p_offset int default 0
) returns table (
  id uuid, user_id uuid, title text, description text, image_url text, source_url text,
  servings int, prep_minutes int, cook_minutes int, total_minutes int,
  ingredients jsonb, steps jsonb, tags text[], parse_method text,
  created_at timestamptz, updated_at timestamptz,
  author_username text, author_full_name text, author_avatar_url text, author_followed boolean, author_verified_badge text
)
language sql stable set search_path = public as $$
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
    select r.*, p.username as a_username, p.full_name as a_full_name, p.avatar_url as a_avatar_url, p.verified_badge as a_verified_badge,
           (r.user_id = auth.uid() or exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = r.user_id)) as followed
    from public.recipes r
    join public.profiles p on p.id = r.user_id
    where r.is_post
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
         s.a_username, s.a_full_name, s.a_avatar_url, s.followed, s.a_verified_badge
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

revoke all on function public.search_recipes(text, text, int, int) from public, anon;
revoke all on function public.feed(text, text, int, int) from public, anon;
grant execute on function public.search_recipes(text, text, int, int) to authenticated;
grant execute on function public.feed(text, text, int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Komentarze (comment_likes.sql) — dopisujemy author_verified_badge
-- ---------------------------------------------------------------------------

drop function if exists public.list_comments(uuid, int, int);
create function public.list_comments(p_recipe uuid, p_limit int default 20, p_offset int default 0)
returns table (
  id uuid, recipe_id uuid, user_id uuid, body text, created_at timestamptz,
  author_username text, author_full_name text, author_avatar_url text, author_verified_badge text,
  like_count int, liked boolean
)
language sql stable set search_path = public as $$
  select c.id, c.recipe_id, c.user_id, c.body, c.created_at, p.username, p.full_name, p.avatar_url, p.verified_badge,
    (select count(*) from public.recipe_comment_likes l where l.comment_id = c.id)::int,
    exists (select 1 from public.recipe_comment_likes l where l.comment_id = c.id and l.user_id = auth.uid())
  from public.recipe_comments c
  join public.profiles p on p.id = c.user_id
  where c.recipe_id = p_recipe
  order by c.created_at desc, c.id
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0)
$$;
revoke all on function public.list_comments(uuid, int, int) from public, anon;
grant execute on function public.list_comments(uuid, int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Osoby, które polubiły przepis (likers.sql) — dopisujemy verified_badge
-- ---------------------------------------------------------------------------

drop function if exists public.list_likers(uuid, int, int);
create function public.list_likers(p_recipe_id uuid, p_limit int default 30, p_offset int default 0)
returns table (
  id uuid, username text, full_name text, avatar_url text, is_public boolean,
  recipe_count int, followers_count int, following_count int, is_following boolean, is_me boolean,
  verified_badge text
)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.full_name, p.avatar_url, p.is_public,
    (case when p.is_public or p.id = auth.uid()
          then (select count(*) from public.recipes r2 where r2.user_id = p.id and r2.is_post) else 0 end)::int,
    p.followers_count, p.following_count,
    exists (select 1 from public.follows x where x.follower_id = auth.uid() and x.followee_id = p.id),
    p.id = auth.uid(),
    p.verified_badge
  from public.recipes r
  join public.recipe_likes l on l.recipe_id = r.id
  join public.profiles p on p.id = l.user_id
  where r.id = p_recipe_id
    and (r.user_id = auth.uid() or (r.is_post and exists (select 1 from public.profiles owner where owner.id = r.user_id and owner.is_public)))
    and (not p.is_test or public.can_see_test_accounts())
    and not public.is_blocked_between(auth.uid(), p.id) and not public.is_blocked_between(auth.uid(), r.user_id)
  order by l.created_at desc, p.username
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0)
$$;
revoke all on function public.list_likers(uuid, int, int) from public, anon;
grant execute on function public.list_likers(uuid, int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Top 10 twórców (trending.sql) — dopisujemy verified_badge
-- ---------------------------------------------------------------------------

drop function if exists public.top_creators(int);
create function public.top_creators(p_limit int default 10)
returns table (user_id uuid, username text, full_name text, avatar_url text, score numeric, verified_badge text)
language sql stable set search_path = public as $$
  with scored as (
    select r.user_id, p.username, p.full_name, p.avatar_url, p.verified_badge, sum(public.recipe_engagement_score(r.id)) as score
    from public.recipes r
    join public.profiles p on p.id = r.user_id
    where r.is_post and r.created_at > now() - interval '14 days'
    group by r.user_id, p.username, p.full_name, p.avatar_url, p.verified_badge
  )
  select user_id, username, full_name, avatar_url, score, verified_badge from scored where score > 0
  order by score desc limit least(greatest(p_limit, 1), 30)
$$;
revoke all on function public.top_creators(int) from public, anon;
grant execute on function public.top_creators(int) to authenticated;

-- ---------------------------------------------------------------------------
-- Powiadomienia (notifications.sql) — dopisujemy actor_verified_badge
-- ---------------------------------------------------------------------------

drop function if exists public.list_notifications(int, int);
create function public.list_notifications(p_limit int default 30, p_offset int default 0)
returns table (
  id uuid, type text, created_at timestamptz, is_read boolean,
  actor_id uuid, actor_username text, actor_full_name text, actor_avatar_url text, actor_verified_badge text,
  recipe_id uuid, recipe_title text, recipe_image_url text, comment_body text
)
language sql stable security definer set search_path = public as $$
  select n.id, n.type, n.created_at, n.read_at is not null,
         a.id, a.username, a.full_name, a.avatar_url, a.verified_badge,
         n.recipe_id, r.title, r.image_url, c.body
  from public.notifications n
  join public.profiles a on a.id = n.actor_id
  left join public.recipes r on r.id = n.recipe_id
  left join public.recipe_comments c on c.id = n.comment_id
  where n.recipient_id = auth.uid() and not public.is_blocked_between(auth.uid(), a.id)
  order by n.created_at desc, n.id
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0)
$$;
revoke all on function public.list_notifications(int, int) from public, anon;
grant execute on function public.list_notifications(int, int) to authenticated;
