import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export interface ServerSupabaseConfig {
  url: string
  anonKey: string
  serviceRoleKey: string
}

/**
 * Dwa klienty do operacji logowania/resetu hasła, tylko po stronie serwera:
 * `anon` do samych operacji Auth (logowanie, wysyłka maila resetu — Supabase Auth i tak przyjmuje je z kluczem publicznym),
 * `admin` (klucz service_role, obchodzi RLS) do znalezienia e-maila po nazwie użytkownika, którego klient NIGDY nie widzi.
 */
export function makeServerClients({ url, anonKey, serviceRoleKey }: ServerSupabaseConfig) {
  return {
    anon: createClient(url, anonKey, { auth: { persistSession: false } }),
    admin: createClient(url, serviceRoleKey, { auth: { persistSession: false } }),
  }
}

/**
 * E-mail powiązany z nazwą użytkownika, albo null dla nieznanej nazwy — WYŁĄCZNIE do użytku
 * serwerowego (wymaga klienta z kluczem service_role). Zastępuje dawną funkcję SQL
 * `email_for_username`, która była wywoływana z przeglądarki i wyciekała e-maile każdemu bez logowania.
 */
export async function emailForUsername(admin: SupabaseClient, username: string): Promise<string | null> {
  const normalized = username.trim().toLowerCase()
  if (!normalized) return null
  const { data: profile } = await admin.from('profiles').select('id').eq('username', normalized).maybeSingle()
  if (!profile) return null
  const { data, error } = await admin.auth.admin.getUserById(profile.id as string)
  if (error || !data.user?.email) return null
  return data.user.email
}

/** Odrzuca żądania z obcych stron (jak w parse-recipe.ts) — to nie jest uwierzytelnianie, tylko higiena */
export function isForeignOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (!origin) return false
  let originHost: string
  try {
    originHost = new URL(origin).host
  } catch {
    return true
  }
  return originHost !== host
}
