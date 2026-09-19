-- ============================================================================
-- Powiadomienia (aktywność): polubienia, komentarze i nowi obserwujący.
-- Uruchom w Supabase → SQL Editor PO schema.sql, social.sql i engagement.sql.
-- Plik można uruchamiać wielokrotnie.
-- ============================================================================
--
-- Powiadomienia powstają w triggerach (klient nie może ich tworzyć ani podrabiać) i trafiają
-- do właściciela przepisu / obserwowanego profilu. Własne akcje nie generują powiadomień.
-- Cofnięcie polubienia lub obserwowania usuwa powiadomienie; usunięcie komentarza albo
-- przepisu usuwa je kaskadowo. Aplikacja słucha wstawień do tej tabeli przez Realtime.

create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  actor_id     uuid not null references public.profiles (id) on delete cascade,
  type         text not null check (type in ('like', 'comment', 'follow')),
  recipe_id    uuid references public.recipes (id) on delete cascade,
  comment_id   uuid references public.recipe_comments (id) on delete cascade,
  created_at   timestamptz not null default now(),
  read_at      timestamptz,
  constraint notifications_not_self check (recipient_id <> actor_id),
  constraint notifications_shape check (
    (type = 'follow'  and recipe_id is null     and comment_id is null) or
    (type = 'like'    and recipe_id is not null and comment_id is null) or
    (type = 'comment' and recipe_id is not null and comment_id is not null)
  )
);

create index if not exists notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (recipient_id) where read_at is null;
-- To samo polubienie / obserwowanie po ponownym dodaniu nie tworzy drugiego powiadomienia naraz
create unique index if not exists notifications_like_uq on public.notifications (recipient_id, actor_id, recipe_id) where type = 'like';
create unique index if not exists notifications_follow_uq on public.notifications (recipient_id, actor_id) where type = 'follow';

alter table public.notifications enable row level security;

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated using (recipient_id = auth.uid());
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications for delete to authenticated using (recipient_id = auth.uid());
-- Brak polityki INSERT: powiadomienia tworzą wyłącznie triggery

-- Klient może tylko czytać, oznaczać jako przeczytane (read_at) i usuwać własne powiadomienia
revoke all on public.notifications from anon, authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Realtime: zdarzenia INSERT trafiają tylko do odbiorcy (filtruje je RLS)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
     ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Triggery. Błąd w powiadomieniu nigdy nie może zablokować polubienia, komentarza ani obserwowania.
-- ---------------------------------------------------------------------------

create or replace function public.notify_like() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  select user_id into owner from public.recipes where id = new.recipe_id;
  if owner is not null and owner <> new.user_id
     and exists (select 1 from public.profiles where id = new.user_id) then
    insert into public.notifications (recipient_id, actor_id, type, recipe_id)
    values (owner, new.user_id, 'like', new.recipe_id)
    on conflict do nothing;
  end if;
  return null;
exception when others then
  return null;
end $$;

create or replace function public.unnotify_like() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.notifications
  where type = 'like' and actor_id = old.user_id and recipe_id = old.recipe_id;
  return null;
exception when others then
  return null;
end $$;

create or replace function public.notify_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  select user_id into owner from public.recipes where id = new.recipe_id;
  if owner is not null and owner <> new.user_id
     and exists (select 1 from public.profiles where id = new.user_id) then
    insert into public.notifications (recipient_id, actor_id, type, recipe_id, comment_id)
    values (owner, new.user_id, 'comment', new.recipe_id, new.id);
  end if;
  return null;
exception when others then
  return null;
end $$;

create or replace function public.notify_follow() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (recipient_id, actor_id, type)
  values (new.followee_id, new.follower_id, 'follow')
  on conflict do nothing;
  return null;
exception when others then
  return null;
end $$;

create or replace function public.unnotify_follow() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.notifications
  where type = 'follow' and actor_id = old.follower_id and recipient_id = old.followee_id;
  return null;
exception when others then
  return null;
end $$;

drop trigger if exists recipe_likes_notify on public.recipe_likes;
create trigger recipe_likes_notify after insert on public.recipe_likes
  for each row execute function public.notify_like();
drop trigger if exists recipe_likes_unnotify on public.recipe_likes;
create trigger recipe_likes_unnotify after delete on public.recipe_likes
  for each row execute function public.unnotify_like();
drop trigger if exists recipe_comments_notify on public.recipe_comments;
create trigger recipe_comments_notify after insert on public.recipe_comments
  for each row execute function public.notify_comment();
drop trigger if exists follows_notify on public.follows;
create trigger follows_notify after insert on public.follows
  for each row execute function public.notify_follow();
drop trigger if exists follows_unnotify on public.follows;
create trigger follows_unnotify after delete on public.follows
  for each row execute function public.unnotify_follow();

-- Funkcje triggerów nie są wołane przez klientów
revoke all on function public.notify_like(), public.unnotify_like(), public.notify_comment(),
  public.notify_follow(), public.unnotify_follow() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Odczyt dla aplikacji
-- ---------------------------------------------------------------------------

-- Lista aktywności z danymi osoby i przepisu, od najnowszych. Tylko moje powiadomienia.
create or replace function public.list_notifications(p_limit int default 30, p_offset int default 0)
returns table (
  id uuid, type text, created_at timestamptz, is_read boolean,
  actor_id uuid, actor_username text, actor_full_name text, actor_avatar_url text,
  recipe_id uuid, recipe_title text, recipe_image_url text, comment_body text
)
language sql stable security definer set search_path = public as $$
  select n.id, n.type, n.created_at, n.read_at is not null,
         a.id, a.username, a.full_name, a.avatar_url,
         n.recipe_id, r.title, r.image_url, c.body
  from public.notifications n
  join public.profiles a on a.id = n.actor_id
  left join public.recipes r on r.id = n.recipe_id
  left join public.recipe_comments c on c.id = n.comment_id
  where n.recipient_id = auth.uid()
  order by n.created_at desc, n.id
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0)
$$;

create or replace function public.unread_notification_count() returns int
language sql stable set search_path = public as $$
  select count(*)::int from public.notifications where recipient_id = auth.uid() and read_at is null
$$;

create or replace function public.mark_notifications_read() returns void
language sql set search_path = public as $$
  update public.notifications set read_at = now() where recipient_id = auth.uid() and read_at is null
$$;

revoke all on function public.list_notifications(int, int) from public, anon;
revoke all on function public.unread_notification_count() from public, anon;
revoke all on function public.mark_notifications_read() from public, anon;
grant execute on function public.list_notifications(int, int) to authenticated;
grant execute on function public.unread_notification_count() to authenticated;
grant execute on function public.mark_notifications_read() to authenticated;
