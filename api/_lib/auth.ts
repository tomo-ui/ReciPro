export interface SupabaseAuthConfig {
  url: string
  anonKey: string
}

/** Wyciąga token z nagłówka `Authorization: Bearer …` */
export function bearerToken(header: string | string[] | undefined): string | null {
  const value = Array.isArray(header) ? header[0] : header
  const m = value?.match(/^Bearer\s+(\S+)$/i)
  return m ? m[1] : null
}

/**
 * Sprawdza token sesji u Supabase (GET /auth/v1/user) — nie potrzebujemy sekretu JWT.
 * Zwraca id użytkownika albo null, gdy token jest nieprawidłowy/wygasły.
 */
export async function verifyAccessToken(
  token: string,
  { url, anonKey }: SupabaseAuthConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<{ id: string } | null> {
  const res = await fetchImpl(`${url.replace(/\/+$/, '')}/auth/v1/user`, {
    headers: { authorization: `Bearer ${token}`, apikey: anonKey },
    signal: AbortSignal.timeout(5000),
  })
  if (res.status === 401 || res.status === 403) return null
  if (!res.ok) throw new Error(`Supabase auth HTTP ${res.status}`)
  const user = (await res.json()) as { id?: unknown }
  return typeof user.id === 'string' ? { id: user.id } : null
}
