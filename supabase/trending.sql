-- ============================================================================
-- Wyświetlenia i najpopularniejsze przepisy: licznik wyświetleń (raz na osobę),
-- szybkie liczenie zapisań i ranking „viralowości” do paska nad feedem (jak Instastories).
-- Uruchom w Supabase → SQL Editor PO engagement.sql. Plik jest idempotentny.
-- ============================================================================

create table if not exists public.recipe_views (
  recipe_id  uuid not null references public.recipes (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (recipe_id, user_id)
);
create index if not exists recipe_views_user_idx on public.recipe_views (user_id, created_at desc);

alter table public.recipe_views enable row level security;

-- Jak polubienia: widoczne tylko pod przepisami, które i tak widać (RLS na recipes odcina prywatne)
drop policy if exists recipe_views_select on public.recipe_views;
create policy recipe_views_select on public.recipe_views for select to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_views.recipe_id));
drop policy if exists recipe_views_insert on public.recipe_views;
create policy recipe_views_insert on public.recipe_views for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.recipes r where r.id = recipe_views.recipe_id));
-- Bez polityk update/delete: wyświetlenie jest trwałe, nikt (nawet właściciel) go nie cofa

-- Zapisania (książka kucharska) to już istniejąca kolumna saved_from_recipe_id (engagement.sql), tylko bez
-- indeksu, w którym jest na pierwszym miejscu (istniejący unikalny indeks ma ją na drugim) — dodajemy pod agregację.
create index if not exists recipes_saved_from_idx on public.recipes (saved_from_recipe_id) where saved_from_recipe_id is not null;

-- ---------------------------------------------------------------------------
-- Najpopularniejsze przepisy (pasek nad feedem, jak Instastories) i top 10 twórców
-- ---------------------------------------------------------------------------

-- Viralowość jednego przepisu: wyświetlenia + polubienia×3 + komentarze×4 + zapisania×5.
-- Wspólna dla trending_recipes, top_creators i top_recipes_by_user, żeby wzór liczyć w jednym miejscu.
create or replace function public.recipe_engagement_score(p_recipe_id uuid) returns numeric
language sql stable set search_path = public as $$
  select
    (select count(*) from public.recipe_views v where v.recipe_id = p_recipe_id)
    + (select count(*) from public.recipe_likes l where l.recipe_id = p_recipe_id) * 3
    + (select count(*) from public.recipe_comments c where c.recipe_id = p_recipe_id) * 4
    + (select count(*) from public.recipes s where s.saved_from_recipe_id = p_recipe_id) * 5
$$;

-- Tylko z ostatnich 14 dni, żeby stary hit nie zajmował miejsca w nieskończoność. RLS na recipes/profiles
-- filtruje prywatne konta, tak samo jak w public.feed — funkcje nie są security definer, widzą to, co wołający.
drop function if exists public.trending_recipes(int);
create function public.trending_recipes(p_limit int default 15)
returns table (
  id uuid, user_id uuid, title text, description text, image_url text, source_url text,
  servings int, prep_minutes int, cook_minutes int, total_minutes int,
  ingredients jsonb, steps jsonb, tags text[], parse_method text,
  created_at timestamptz, updated_at timestamptz,
  author_username text, author_full_name text, author_avatar_url text
)
language sql stable set search_path = public as $$
  select r.id, r.user_id, r.title, r.description, r.image_url, r.source_url,
         r.servings, r.prep_minutes, r.cook_minutes, r.total_minutes,
         r.ingredients, r.steps, r.tags, r.parse_method, r.created_at, r.updated_at,
         p.username, p.full_name, p.avatar_url
  from public.recipes r
  join public.profiles p on p.id = r.user_id
  where r.is_post and r.created_at > now() - interval '14 days'
  order by public.recipe_engagement_score(r.id) desc, r.created_at desc
  limit least(greatest(p_limit, 1), 30)
$$;

revoke all on function public.trending_recipes(int) from public, anon;
grant execute on function public.trending_recipes(int) to authenticated;

-- Top 10 twórców: suma viralowości ich postów z ostatnich 14 dni (ten sam wzór, zagregowany na osobę)
drop function if exists public.top_creators(int);
create function public.top_creators(p_limit int default 10)
returns table (user_id uuid, username text, full_name text, avatar_url text, score numeric)
language sql stable set search_path = public as $$
  with scored as (
    select r.user_id, p.username, p.full_name, p.avatar_url, sum(public.recipe_engagement_score(r.id)) as score
    from public.recipes r
    join public.profiles p on p.id = r.user_id
    where r.is_post and r.created_at > now() - interval '14 days'
    group by r.user_id, p.username, p.full_name, p.avatar_url
  )
  select * from scored where score > 0 order by score desc limit least(greatest(p_limit, 1), 30)
$$;

revoke all on function public.top_creators(int) from public, anon;
grant execute on function public.top_creators(int) to authenticated;

-- Najlepsze przepisy jednego twórcy (podgląd po rozwinięciu wiersza na liście top twórców).
-- Bez okna 14 dni: dobry, starszy przepis wciąż liczy się jako „najlepszy” tej osoby.
drop function if exists public.top_recipes_by_user(uuid, int);
create function public.top_recipes_by_user(p_user_id uuid, p_limit int default 3)
returns table (
  id uuid, user_id uuid, title text, description text, image_url text, source_url text,
  servings int, prep_minutes int, cook_minutes int, total_minutes int,
  ingredients jsonb, steps jsonb, tags text[], parse_method text,
  created_at timestamptz, updated_at timestamptz,
  author_username text, author_full_name text, author_avatar_url text
)
language sql stable set search_path = public as $$
  select r.id, r.user_id, r.title, r.description, r.image_url, r.source_url,
         r.servings, r.prep_minutes, r.cook_minutes, r.total_minutes,
         r.ingredients, r.steps, r.tags, r.parse_method, r.created_at, r.updated_at,
         p.username, p.full_name, p.avatar_url
  from public.recipes r
  join public.profiles p on p.id = r.user_id
  where r.user_id = p_user_id and r.is_post
  order by public.recipe_engagement_score(r.id) desc, r.created_at desc
  limit least(greatest(p_limit, 1), 10)
$$;

revoke all on function public.top_recipes_by_user(uuid, int) from public, anon;
grant execute on function public.top_recipes_by_user(uuid, int) to authenticated;
