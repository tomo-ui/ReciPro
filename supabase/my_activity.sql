-- ============================================================================
-- Własna aktywność (Ustawienia → Moja aktywność): moje własne polubienia i komentarze,
-- chronologicznie. To NIE jest to samo co powiadomienia (notifications.sql) — tamte pokazują
-- cudze działania na moich przepisach, to pokazuje moje własne działania na cudzych.
-- Uruchom w Supabase → SQL Editor PO engagement.sql. Plik jest idempotentny.
-- ============================================================================

-- recipe_likes ma już indeks (user_id, created_at desc) z engagement.sql; recipe_comments nie miał.
create index if not exists recipe_comments_user_id_created_at_idx on public.recipe_comments (user_id, created_at desc);

create or replace function public.list_my_activity(p_limit int default 20, p_offset int default 0)
returns table (
  kind text, -- 'like' | 'comment'
  recipe_id uuid,
  recipe_title text,
  comment_id uuid,
  comment_body text,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select * from (
    select 'like'::text as kind, l.recipe_id, r.title as recipe_title,
           null::uuid as comment_id, null::text as comment_body, l.created_at
    from public.recipe_likes l
    join public.recipes r on r.id = l.recipe_id
    where l.user_id = auth.uid()
    union all
    select 'comment'::text as kind, c.recipe_id, r.title as recipe_title,
           c.id as comment_id, c.body as comment_body, c.created_at
    from public.recipe_comments c
    join public.recipes r on r.id = c.recipe_id
    where c.user_id = auth.uid()
  ) x
  order by created_at desc, coalesce(comment_id, recipe_id)
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0)
$$;
revoke all on function public.list_my_activity(int, int) from public, anon;
grant execute on function public.list_my_activity(int, int) to authenticated;
