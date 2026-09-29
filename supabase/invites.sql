-- ============================================================================
-- Kody zaproszeń: zamknięta beta — założenie profilu wymaga jednorazowego kodu wygenerowanego
-- przez admina (konto „tk”, panel w Ustawieniach). Kod działa tylko raz, potem już nie.
-- Uruchom w Supabase → SQL Editor PO engagement.sql (potrzebuje tabeli app_admins). Plik jest idempotentny.
-- ============================================================================

create table if not exists public.invite_codes (
  code       text primary key,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  used_at    timestamptz,
  used_by    uuid references auth.users (id) on delete set null
);
alter table public.invite_codes enable row level security;
-- Bez żadnych polityk: dostęp wyłącznie przez funkcje security definer poniżej, nawet dla admina
revoke all on public.invite_codes from public, anon, authenticated;

-- Losowy kod: 5 różnych znaków (wielkie litery A-Z i cyfry 0-9)
create or replace function public.generate_invite_code() returns text
language plpgsql volatile set search_path = public as $$
declare
  alphabet text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result text := '';
  pick text;
begin
  while length(result) < 5 loop
    pick := substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    if strpos(result, pick) = 0 then
      result := result || pick;
    end if;
  end loop;
  return result;
end;
$$;

-- Nowy kod — tylko admin. Losowanie powtarza się przy (astronomicznie rzadkiej) kolizji z istniejącym kodem.
create or replace function public.admin_create_invite_code() returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  new_code text;
begin
  if not exists (select 1 from public.app_admins a where a.user_id = auth.uid()) then
    raise exception 'permission denied';
  end if;
  loop
    new_code := public.generate_invite_code();
    begin
      insert into public.invite_codes (code, created_by) values (new_code, auth.uid());
      return new_code;
    exception when unique_violation then
      -- kolizja losowania — spróbuj ponownie
    end;
  end loop;
end;
$$;
revoke all on function public.admin_create_invite_code() from public, anon;
grant execute on function public.admin_create_invite_code() to authenticated;

-- Lista kodów do panelu admina; dla kogoś innego niż admin pusta, żeby nie ujawniać aktywnych kodów
create or replace function public.admin_list_invite_codes()
returns table (code text, created_at timestamptz, used_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.code, i.created_at, i.used_at
  from public.invite_codes i
  where exists (select 1 from public.app_admins a where a.user_id = auth.uid())
  order by i.created_at desc
$$;
revoke all on function public.admin_list_invite_codes() from public, anon;
grant execute on function public.admin_list_invite_codes() to authenticated;

-- Założenie profilu: zużywa ważny, jeszcze nieużyty kod w tej samej transakcji co insert profilu,
-- więc kod NIE przepada, jeśli insert się nie powiedzie (np. nazwa zajęta w międzyczasie) — całość się cofa.
create or replace function public.create_profile_with_invite(p_username text, p_full_name text, p_invite_code text)
returns public.profiles
language plpgsql volatile security definer set search_path = public as $$
declare
  affected int;
  row_out public.profiles;
begin
  update public.invite_codes
    set used_at = now(), used_by = auth.uid()
    where code = upper(trim(coalesce(p_invite_code, ''))) and used_at is null;
  get diagnostics affected = row_count;
  if affected = 0 then
    raise exception 'invite_code_invalid';
  end if;

  insert into public.profiles (id, username, full_name)
  values (auth.uid(), p_username, p_full_name)
  returning * into row_out;

  return row_out;
end;
$$;
revoke all on function public.create_profile_with_invite(text, text, text) from public, anon;
grant execute on function public.create_profile_with_invite(text, text, text) to authenticated;

-- Usunięcie kodu (użytego albo nie) — tylko admin. Kasuje tylko wpis w historii, nie cofa już założonych kont.
create or replace function public.admin_delete_invite_code(p_code text) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not exists (select 1 from public.app_admins a where a.user_id = auth.uid()) then
    raise exception 'permission denied';
  end if;
  delete from public.invite_codes where code = upper(trim(coalesce(p_code, '')));
end;
$$;
revoke all on function public.admin_delete_invite_code(text) from public, anon;
grant execute on function public.admin_delete_invite_code(text) to authenticated;
