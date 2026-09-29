-- ============================================================================
-- USUNIĘCIE luki: email_for_username była dostępna dla anon i zwracała e-mail
-- dla DOWOLNEJ nazwy użytkownika — a nazwy są jawne (widoczne w komentarzach, na profilach,
-- w feedzie), więc każdy mógł w ten sposób zebrać e-maile wszystkich użytkowników.
-- Tłumaczenie login→e-mail i samo logowanie/reset hasła przeniesione na serwer
-- (api/login.ts, api/forgot-password.ts) z kluczem service_role — e-mail nigdy
-- nie trafia do przeglądarki. Uruchom w Supabase → SQL Editor. Plik jest idempotentny.
-- ============================================================================

drop function if exists public.email_for_username(text);
