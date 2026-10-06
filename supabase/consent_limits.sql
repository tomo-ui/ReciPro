-- ============================================================================
-- Zgoda na przetwarzanie przez zewnętrzne AI (Apple 5.1.2(i), RODO art. 6 ust. 1 lit. a) oraz limity zapytań do API
-- (importy AI, logowanie, reset hasła). Uruchom w Supabase → SQL Editor po schema.sql. Plik jest idempotentny.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Zgody użytkownika (osobna tabela, a nie kolumna profilu: profile są czytelne dla wszystkich zalogowanych, zgoda nie)
-- ---------------------------------------------------------------------------

create table if not exists public.user_consents (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  ai_consent_at      timestamptz,
  ai_consent_version int,
  updated_at         timestamptz not null default now()
);

alter table public.user_consents enable row level security;
drop policy if exists user_consents_select on public.user_consents;
create policy user_consents_select on public.user_consents for select to authenticated using (user_id = auth.uid());
-- Zapis tylko przez set_ai_consent (znacznik czasu nadaje serwer, nie klient)
revoke all on public.user_consents from anon, authenticated;
grant select on public.user_consents to authenticated;

-- p_version: wersja treści zgody, którą użytkownik zobaczył (po zmianie tekstu prosimy o zgodę ponownie)
create or replace function public.set_ai_consent(p_granted boolean, p_version int default 1) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  insert into public.user_consents (user_id, ai_consent_at, ai_consent_version, updated_at)
  values (auth.uid(), case when p_granted then now() end, case when p_granted then p_version end, now())
  on conflict (user_id) do update
    set ai_consent_at = excluded.ai_consent_at, ai_consent_version = excluded.ai_consent_version, updated_at = now();
end;
$$;
revoke all on function public.set_ai_consent(boolean, int) from public, anon;
grant execute on function public.set_ai_consent(boolean, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Limity zapytań: zdarzenia zliczane w oknie czasowym. Używa ich wyłącznie serwer (klucz service_role) —
-- klient nie ma do tabeli ani funkcji żadnego dostępu.
-- ---------------------------------------------------------------------------

create table if not exists public.rate_limit_events (
  id         bigint generated always as identity primary key,
  key        text not null,
  created_at timestamptz not null default now()
);
create index if not exists rate_limit_events_key_idx on public.rate_limit_events (key, created_at desc);
create index if not exists rate_limit_events_created_idx on public.rate_limit_events (created_at);

alter table public.rate_limit_events enable row level security;
revoke all on public.rate_limit_events from anon, authenticated;

-- true = można (zdarzenie zapisane), false = limit wyczerpany (nic nie zapisano).
-- Klucze mają postać „typ:identyfikator”, np. ai:<user_id>, login-ip:<skrót IP>. Przy okazji sprzątamy stare zdarzenia.
create or replace function public.consume_rate_limit(p_key text, p_limit int, p_window_seconds int) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare
  n int;
begin
  if p_key is null or p_limit < 1 or p_window_seconds < 1 then
    raise exception 'invalid rate limit arguments';
  end if;
  if random() < 0.02 then
    delete from public.rate_limit_events where created_at < now() - interval '2 days';
  end if;
  select count(*) into n from public.rate_limit_events
   where key = p_key and created_at > now() - make_interval(secs => p_window_seconds);
  if n >= p_limit then
    return false;
  end if;
  insert into public.rate_limit_events (key) values (p_key);
  return true;
end;
$$;
revoke all on function public.consume_rate_limit(text, int, int) from public, anon, authenticated;
