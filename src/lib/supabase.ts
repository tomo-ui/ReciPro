import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Bez zmiennych środowiskowych aplikacja działa lokalnie na localStorage, bez logowania */
export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Logujemy się kodem z maila, nie linkiem — w PWA na iOS link otwiera Safari, nie aplikację
        detectSessionInUrl: false,
      },
    })
  : null

export async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

/**
 * Czy aplikacja korzysta z Supabase (konta, chmura). W trybie deweloperskim `?demo=1` wymusza
 * tryb lokalny mimo obecnych kluczy — do oglądania interfejsu bez logowania.
 */
const forceDemo =
  import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo')

export const usesSupabase = isSupabaseConfigured && !forceDemo
