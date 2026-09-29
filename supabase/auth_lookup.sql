-- ============================================================================
-- Logowanie nazwą użytkownika: Supabase Auth zna tylko e-mail, więc klient najpierw
-- tłumaczy nazwę użytkownika na e-mail tą funkcją, dopiero potem woła signInWithPassword.
-- Uruchom w Supabase → SQL Editor PO social.sql (potrzebuje tabeli profiles). Plik jest idempotentny.
-- ============================================================================

-- Zwraca e-mail powiązany z nazwą użytkownika, albo null dla nieznanej nazwy (bez wyjątku —
-- żeby błąd logowania wyglądał tak samo dla złej nazwy i złego hasła, bez zdradzania istnienia konta).
-- Wołane jeszcze przed zalogowaniem (ekran logowania i „Nie pamiętam hasła”), więc dostępne dla anon.
create or replace function public.email_for_username(p_username text) returns text
language sql stable security definer set search_path = public as $$
  select u.email
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.username = lower(trim(coalesce(p_username, '')))
$$;
revoke all on function public.email_for_username(text) from public, anon;
grant execute on function public.email_for_username(text) to anon;
