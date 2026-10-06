import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Limity zapytań do endpointów /api (logowanie, reset hasła, importy z AI). Licznik żyje w bazie
 * (supabase/consent_limits.sql → consume_rate_limit, tylko dla klucza service_role), bo funkcje serverless
 * nie współdzielą pamięci. Do bazy trafia wyłącznie skrót identyfikatora (IP, nazwa użytkownika), nigdy sam adres.
 */

export interface Rule {
  limit: number
  windowSeconds: number
}

export const LIMITS = {
  /** Próby logowania z jednego adresu IP / na jedną nazwę użytkownika */
  loginIp: { limit: 40, windowSeconds: 15 * 60 },
  loginUser: { limit: 10, windowSeconds: 15 * 60 },
  /** Maile z resetem hasła (każdy wysłany mail kosztuje i bywa nadużywany do spamu) */
  resetIp: { limit: 10, windowSeconds: 60 * 60 },
  resetUser: { limit: 3, windowSeconds: 60 * 60 },
  /** Importy przepisów (każdy może wołać Gemini): krótka seria i dzień */
  importBurst: { limit: 8, windowSeconds: 5 * 60 },
  importDay: { limit: 40, windowSeconds: 24 * 60 * 60 },
  /** Usuwanie konta (pomyłkowe lub złośliwe serie) */
  deleteIp: { limit: 5, windowSeconds: 60 * 60 },
} as const satisfies Record<string, Rule>

type Headers = Record<string, string | string[] | undefined>

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

/** Adres klienta za proxy Vercela (pierwszy wpis X-Forwarded-For); „unknown”, gdy nagłówków brak (np. lokalnie) */
export function clientIp(headers: Headers): string {
  const forwarded = first(headers['x-vercel-forwarded-for']) ?? first(headers['x-forwarded-for']) ?? first(headers['x-real-ip'])
  return forwarded?.split(',')[0]?.trim() || 'unknown'
}

/** Skrót identyfikatora do klucza limitu — w bazie nie zostaje ani adres IP, ani nazwa użytkownika */
export function hashId(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex').slice(0, 24)
}

/**
 * true = wolno, false = limit wyczerpany. Awaria bazy (np. nieuruchomiona migracja) NIE blokuje użytkowników:
 * limit chroni przed nadużyciem, nie jest barierą bezpieczeństwa, więc przy błędzie przepuszczamy i głośno logujemy.
 */
export async function allow(admin: SupabaseClient, key: string, rule: Rule): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc('consume_rate_limit', { p_key: key, p_limit: rule.limit, p_window_seconds: rule.windowSeconds })
    if (error) throw new Error(error.message)
    return data !== false
  } catch (e) {
    console.error('[rateLimit] nie udało się sprawdzić limitu — przepuszczam:', e instanceof Error ? e.message : e)
    return true
  }
}
