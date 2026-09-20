import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { unaccent } from '@electric-sql/pglite/contrib/unaccent'

/**
 * Prawdziwy Postgres (PGlite, WASM) z atrapą środowiska Supabase (auth.uid(), role, schemat storage),
 * na którym uruchamiamy WSZYSTKIE migracje z repozytorium. RLS, ograniczenia i funkcje SQL wykonują się naprawdę.
 */
export async function createDb(): Promise<PGlite> {
  const db = new PGlite({ extensions: { pg_trgm, unaccent } })

  await db.exec(`
    create schema extensions;
    create extension pg_trgm with schema extensions;
    create extension unaccent with schema extensions;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role anon nologin;
    create role authenticated nologin;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable
      as $$ select (string_to_array(name, '/'))[1:greatest(array_length(string_to_array(name, '/'), 1) - 1, 0)] $$;
  `)

  // Domyślne uprawnienia jak w Supabase: nowe obiekty w public są dostępne dla anon/authenticated,
  // a ich wycofanie robią dopiero same migracje (revoke …)
  await db.exec(`
    grant usage on schema public, extensions, auth, storage to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    grant execute on all functions in schema extensions to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant execute on functions to anon, authenticated;
    grant all on all tables in schema storage to authenticated;
  `)

  await db.exec(readFileSync('supabase/schema.sql', 'utf8'))
  await db.exec(readFileSync('supabase/social.sql', 'utf8'))
  await db.exec(readFileSync('supabase/social.sql', 'utf8')) // idempotentność
  const engagement = readFileSync('supabase/engagement.sql', 'utf8')
  await db.exec(engagement)
  await db.exec(engagement) // idempotentność
  const notifications = readFileSync('supabase/notifications.sql', 'utf8')
  await db.exec(notifications)
  await db.exec(notifications) // idempotentność
  const diets = readFileSync('supabase/diets.sql', 'utf8')
  await db.exec(diets)
  await db.exec(diets) // idempotentność
  return db
}

/** Wykonywanie zapytań jako zalogowany użytkownik (rola authenticated + auth.uid()) albo anon */
export function actors(db: PGlite) {
  async function as<T = Record<string, unknown>>(uid: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
    await db.exec(uid ? `set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);` : 'set role anon;')
    try {
      return (await db.query<T>(sql, params)).rows
    } finally {
      await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`)
    }
  }
  /** Zwraca komunikat błędu albo null, gdy zapytanie się powiodło */
  const asOk = async (uid: string | null, sql: string, params: unknown[] = []) => {
    try {
      await as(uid, sql, params)
      return null
    } catch (e) {
      return (e as Error).message
    }
  }
  return { as, asOk }
}
