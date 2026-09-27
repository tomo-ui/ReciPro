-- ============================================================================
-- Lista osób, które polubiły dany przepis — wzorowana na list_followers/list_following
-- z engagement.sql (ten sam kształt wiersza: ProfileSummary).
-- Uruchom w Supabase → SQL Editor PO engagement.sql. Plik jest idempotentny.
-- ============================================================================

drop function if exists public.list_likers(uuid, int, int);
create function public.list_likers(p_recipe_id uuid, p_limit int default 30, p_offset int default 0)
returns table (
  id uuid, username text, full_name text, avatar_url text, is_public boolean,
  recipe_count int, followers_count int, following_count int, is_following boolean, is_me boolean
)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.full_name, p.avatar_url, p.is_public,
    (case when p.is_public or p.id = auth.uid()
          then (select count(*) from public.recipes r2 where r2.user_id = p.id and r2.is_post) else 0 end)::int,
    p.followers_count, p.following_count,
    exists (select 1 from public.follows x where x.follower_id = auth.uid() and x.followee_id = p.id),
    p.id = auth.uid()
  from public.recipes r
  join public.recipe_likes l on l.recipe_id = r.id
  join public.profiles p on p.id = l.user_id
  where r.id = p_recipe_id
    -- ta sama widoczność co recipes_select_visible: własny przepis albo publiczny post
    and (r.user_id = auth.uid() or (r.is_post and exists (select 1 from public.profiles owner where owner.id = r.user_id and owner.is_public)))
    and (not p.is_test or public.can_see_test_accounts())
  order by l.created_at desc, p.username
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0)
$$;
revoke all on function public.list_likers(uuid, int, int) from public, anon;
grant execute on function public.list_likers(uuid, int, int) to authenticated;
