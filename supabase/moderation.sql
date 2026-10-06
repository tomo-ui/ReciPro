-- ============================================================================
-- Blokowanie użytkowników, zgłaszanie treści i panel moderacji (wymóg Apple 1.2 / Google UGC / DSA).
-- Uruchom w Supabase → SQL Editor PO engagement.sql, notifications.sql, trending.sql, comment_likes.sql i likers.sql,
-- a PRZED badges.sql (badges.sql ma już filtr blokad w swoich funkcjach). Plik jest idempotentny.
-- Jeśli kiedykolwiek uruchomisz ponownie social.sql / engagement.sql / comment_likes.sql, uruchom po nich ten plik jeszcze raz —
-- te pliki odtwarzają polityki dostępu bez filtra blokad.
-- ============================================================================
--
-- Jak działa blokada: zablokowana osoba i jej treści znikają dla blokującego (i odwrotnie): profil, przepisy, komentarze,
-- polubienia, obserwowanie, powiadomienia. Robi to RLS (is_blocked_between w politykach) oraz filtr w funkcjach
-- SECURITY DEFINER z badges.sql, które RLS omijają.

-- ---------------------------------------------------------------------------
-- Blokady
-- ---------------------------------------------------------------------------

create table if not exists public.blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);
create index if not exists blocks_blocked_idx on public.blocks (blocked_id);

alter table public.blocks enable row level security;
drop policy if exists blocks_select on public.blocks;
create policy blocks_select on public.blocks for select to authenticated using (blocker_id = auth.uid());
-- Zapis tylko przez block_user / unblock_user (sprzątają przy okazji obserwowania i powiadomienia)
revoke all on public.blocks from anon, authenticated;
grant select on public.blocks to authenticated;

-- Czy któraś ze stron zablokowała drugą. SECURITY DEFINER, bo polityki innych tabel nie mogą czytać cudzych blokad przez RLS.
create or replace function public.is_blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select a is not null and b is not null and a <> b and exists (
    select 1 from public.blocks x
    where (x.blocker_id = a and x.blocked_id = b) or (x.blocker_id = b and x.blocked_id = a)
  )
$$;
revoke all on function public.is_blocked_between(uuid, uuid) from public, anon;
grant execute on function public.is_blocked_between(uuid, uuid) to authenticated;

-- Polityki dostępu z filtrem blokad (zastępują wersje z social.sql / engagement.sql / comment_likes.sql)
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using ((not is_test or public.can_see_test_accounts()) and not public.is_blocked_between(auth.uid(), id));

drop policy if exists recipes_select_visible on public.recipes;
create policy recipes_select_visible on public.recipes for select to authenticated
  using (
    user_id = auth.uid()
    or (
      is_post
      and exists (select 1 from public.profiles p where p.id = recipes.user_id and p.is_public)
      and not public.is_blocked_between(auth.uid(), user_id)
    )
  );

drop policy if exists recipe_likes_select on public.recipe_likes;
create policy recipe_likes_select on public.recipe_likes for select to authenticated
  using (
    exists (select 1 from public.recipes r where r.id = recipe_likes.recipe_id)
    and not public.is_blocked_between(auth.uid(), user_id)
  );

drop policy if exists recipe_comments_select on public.recipe_comments;
create policy recipe_comments_select on public.recipe_comments for select to authenticated
  using (
    exists (select 1 from public.recipes r where r.id = recipe_comments.recipe_id)
    and not public.is_blocked_between(auth.uid(), user_id)
  );

drop policy if exists recipe_comment_likes_select on public.recipe_comment_likes;
create policy recipe_comment_likes_select on public.recipe_comment_likes for select to authenticated
  using (
    exists (select 1 from public.recipe_comments c where c.id = recipe_comment_likes.comment_id)
    and not public.is_blocked_between(auth.uid(), user_id)
  );

drop policy if exists follows_insert on public.follows;
create policy follows_insert on public.follows for insert to authenticated
  with check (follower_id = auth.uid() and not public.is_blocked_between(follower_id, followee_id));

create or replace function public.block_user(p_user uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_user is null or p_user = auth.uid() then
    raise exception 'invalid user';
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'user not found';
  end if;
  insert into public.blocks (blocker_id, blocked_id) values (auth.uid(), p_user) on conflict do nothing;
  -- Obserwowanie w obie strony kończy się razem z blokadą (liczniki poprawiają triggery)
  delete from public.follows
   where (follower_id = auth.uid() and followee_id = p_user) or (follower_id = p_user and followee_id = auth.uid());
  delete from public.notifications
   where (recipient_id = auth.uid() and actor_id = p_user) or (recipient_id = p_user and actor_id = auth.uid());
end;
$$;

create or replace function public.unblock_user(p_user uuid) returns void
language sql volatile security definer set search_path = public as $$
  delete from public.blocks where blocker_id = auth.uid() and blocked_id = p_user
$$;

-- Lista osób zablokowanych przeze mnie (profile są dla mnie ukryte przez RLS, więc czytamy je jako definer)
create or replace function public.list_blocked_users(p_limit int default 50, p_offset int default 0)
returns table (id uuid, username text, full_name text, avatar_url text, blocked_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.full_name, p.avatar_url, b.created_at
  from public.blocks b
  join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc, p.username
  limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)
$$;

revoke all on function public.block_user(uuid), public.unblock_user(uuid), public.list_blocked_users(int, int) from public, anon;
grant execute on function public.block_user(uuid), public.unblock_user(uuid), public.list_blocked_users(int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Zgłoszenia treści (przepis / komentarz / profil)
-- ---------------------------------------------------------------------------

create table if not exists public.reports (
  id             uuid primary key default gen_random_uuid(),
  reporter_id    uuid references auth.users (id) on delete set null,
  target_type    text not null check (target_type in ('recipe', 'comment', 'profile')),
  target_id      uuid not null,
  target_user_id uuid references auth.users (id) on delete set null,
  -- Fragment zgłoszonej treści z chwili zgłoszenia — żeby dało się ją ocenić także po edycji lub usunięciu
  excerpt        text,
  reason         text not null check (reason in ('spam', 'offensive', 'copyright', 'inappropriate', 'other')),
  details        text check (details is null or char_length(details) <= 500),
  status         text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  action         text,
  created_at     timestamptz not null default now(),
  handled_by     uuid references auth.users (id) on delete set null,
  handled_at     timestamptz
);
-- Jedna osoba zgłasza daną treść raz
create unique index if not exists reports_once on public.reports (reporter_id, target_type, target_id) where reporter_id is not null;
create index if not exists reports_status_idx on public.reports (status, created_at);
create index if not exists reports_target_idx on public.reports (target_type, target_id);
create index if not exists reports_target_user_idx on public.reports (target_user_id);

-- Zgłoszenia czytają i zmieniają tylko funkcje poniżej (brak polityk = brak dostępu dla klienta)
alter table public.reports enable row level security;
revoke all on public.reports from anon, authenticated;

create or replace function public.report_content(p_type text, p_id uuid, p_reason text, p_details text default null)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_user uuid;
  v_excerpt text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_reason not in ('spam', 'offensive', 'copyright', 'inappropriate', 'other') then
    raise exception 'invalid reason';
  end if;
  if p_details is not null and char_length(p_details) > 500 then
    raise exception 'details too long';
  end if;

  if p_type = 'recipe' then
    select r.user_id, left(r.title, 200) into v_user, v_excerpt
    from public.recipes r
    where r.id = p_id and r.is_post and exists (select 1 from public.profiles o where o.id = r.user_id and o.is_public);
  elsif p_type = 'comment' then
    select c.user_id, left(c.body, 300) into v_user, v_excerpt
    from public.recipe_comments c
    join public.recipes r on r.id = c.recipe_id
    where c.id = p_id and (r.user_id = auth.uid() or (r.is_post and exists (select 1 from public.profiles o where o.id = r.user_id and o.is_public)));
  elsif p_type = 'profile' then
    select p.id, left(p.username, 60) into v_user, v_excerpt from public.profiles p where p.id = p_id;
  else
    raise exception 'invalid type';
  end if;

  if v_user is null then
    raise exception 'target not found';
  end if;
  if v_user = auth.uid() then
    raise exception 'cannot report own content';
  end if;
  -- Ochrona przed zalewaniem moderacji
  if (select count(*) from public.reports where reporter_id = auth.uid() and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'too many reports';
  end if;

  insert into public.reports (reporter_id, target_type, target_id, target_user_id, excerpt, reason, details)
  values (auth.uid(), p_type, p_id, v_user, v_excerpt, p_reason, nullif(btrim(coalesce(p_details, '')), ''))
  on conflict do nothing;
end;
$$;
revoke all on function public.report_content(text, uuid, text, text) from public, anon;
grant execute on function public.report_content(text, uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Panel moderacji (tylko administratorzy z tabeli app_admins)
-- ---------------------------------------------------------------------------

create or replace function public.admin_open_report_count() returns int
language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from public.app_admins a where a.user_id = auth.uid())
              then (select count(*)::int from public.reports where status = 'open') else 0 end
$$;

-- p_status: 'open' | 'resolved' | 'dismissed' | 'all'. Otwarte od najstarszych (czas reakcji liczy się od zgłoszenia).
create or replace function public.admin_list_reports(p_status text default 'open', p_limit int default 30, p_offset int default 0)
returns table (
  id uuid, target_type text, target_id uuid, target_user_id uuid, target_username text, excerpt text,
  reason text, details text, status text, action text, created_at timestamptz,
  reporter_username text, reports_count int
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.app_admins a where a.user_id = auth.uid()) then
    raise exception 'permission denied';
  end if;
  return query
    select r.id, r.target_type, r.target_id, r.target_user_id, tp.username, r.excerpt,
           r.reason, r.details, r.status, r.action, r.created_at,
           rp.username,
           (select count(*)::int from public.reports x where x.target_type = r.target_type and x.target_id = r.target_id)
    from public.reports r
    left join public.profiles tp on tp.id = r.target_user_id
    left join public.profiles rp on rp.id = r.reporter_id
    where p_status = 'all' or r.status = p_status
    order by case when r.status = 'open' then r.created_at end asc nulls last, r.created_at desc, r.id
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end;
$$;

-- p_action: 'dismiss' (odrzuć to zgłoszenie) | 'remove_content' (usuń przepis lub komentarz i zamknij wszystkie zgłoszenia tej treści).
-- Usunięcie konta autora robi serwer (api/account.ts), bo wymaga uprawnień administratora Auth.
create or replace function public.admin_resolve_report(p_report uuid, p_action text) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  rep public.reports%rowtype;
begin
  if not exists (select 1 from public.app_admins a where a.user_id = auth.uid()) then
    raise exception 'permission denied';
  end if;
  select * into rep from public.reports where id = p_report;
  if not found then
    raise exception 'report not found';
  end if;

  if p_action = 'dismiss' then
    update public.reports set status = 'dismissed', action = 'dismiss', handled_by = auth.uid(), handled_at = now() where id = p_report;
  elsif p_action = 'remove_content' then
    if rep.target_type = 'recipe' then
      delete from public.recipes where id = rep.target_id;
    elsif rep.target_type = 'comment' then
      delete from public.recipe_comments where id = rep.target_id;
    else
      raise exception 'profile cannot be removed this way';
    end if;
    update public.reports set status = 'resolved', action = 'remove_content', handled_by = auth.uid(), handled_at = now()
     where target_type = rep.target_type and target_id = rep.target_id and status = 'open';
  else
    raise exception 'invalid action';
  end if;
end;
$$;

revoke all on function public.admin_open_report_count(), public.admin_list_reports(text, int, int), public.admin_resolve_report(uuid, text) from public, anon;
grant execute on function public.admin_open_report_count(), public.admin_list_reports(text, int, int), public.admin_resolve_report(uuid, text) to authenticated;
