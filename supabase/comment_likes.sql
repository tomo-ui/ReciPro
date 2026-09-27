-- ============================================================================
-- Polubienia komentarzy — jak polubienia przepisów (recipe_likes), tylko dla pojedynczego komentarza.
-- Uruchom w Supabase → SQL Editor PO engagement.sql. Plik jest idempotentny.
-- ============================================================================

create table if not exists public.recipe_comment_likes (
  comment_id uuid not null references public.recipe_comments (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
create index if not exists recipe_comment_likes_user_idx on public.recipe_comment_likes (user_id, created_at desc);

alter table public.recipe_comment_likes enable row level security;

-- Jak polubienia przepisów: widoczne i można dawać tylko pod komentarzami, które i tak się widzi
-- (podzapytanie do recipe_comments → jego RLS filtruje niewidoczne przepisy)
drop policy if exists recipe_comment_likes_select on public.recipe_comment_likes;
create policy recipe_comment_likes_select on public.recipe_comment_likes for select to authenticated
  using (exists (select 1 from public.recipe_comments c where c.id = recipe_comment_likes.comment_id));
drop policy if exists recipe_comment_likes_insert on public.recipe_comment_likes;
create policy recipe_comment_likes_insert on public.recipe_comment_likes for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.recipe_comments c where c.id = recipe_comment_likes.comment_id));
drop policy if exists recipe_comment_likes_delete on public.recipe_comment_likes;
create policy recipe_comment_likes_delete on public.recipe_comment_likes for delete to authenticated using (user_id = auth.uid());

-- list_comments dostaje like_count/liked — kształt się zmienia, więc funkcję trzeba usunąć i utworzyć na nowo
drop function if exists public.list_comments(uuid, int, int);
create function public.list_comments(p_recipe uuid, p_limit int default 20, p_offset int default 0)
returns table (
  id uuid, recipe_id uuid, user_id uuid, body text, created_at timestamptz,
  author_username text, author_full_name text, author_avatar_url text,
  like_count int, liked boolean
)
language sql stable set search_path = public as $$
  select c.id, c.recipe_id, c.user_id, c.body, c.created_at, p.username, p.full_name, p.avatar_url,
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
