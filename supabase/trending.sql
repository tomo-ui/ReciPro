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
-- Najpopularniejsze przepisy (pasek nad feedem, jak Instastories)
-- ---------------------------------------------------------------------------

-- Viralowość: wyświetlenia + polubienia×3 + komentarze×4 + zapisania×5, tylko z ostatnich 14 dni,
-- żeby stary hit nie zajmował miejsca w nieskończoność. RLS na recipes/profiles filtruje prywatne konta,
-- tak samo jak w public.feed — funkcja nie jest security definer, więc widzi dokładnie to, co wołający.
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
  order by (
    (select count(*) from public.recipe_views v where v.recipe_id = r.id)
    + (select count(*) from public.recipe_likes l where l.recipe_id = r.id) * 3
    + (select count(*) from public.recipe_comments c where c.recipe_id = r.id) * 4
    + (select count(*) from public.recipes s where s.saved_from_recipe_id = r.id) * 5
  ) desc, r.created_at desc
  limit least(greatest(p_limit, 1), 30)
$$;

revoke all on function public.trending_recipes(int) from public, anon;
grant execute on function public.trending_recipes(int) to authenticated;
