import type { ParseOrigin, RecipeDraft } from '@/types/recipe'
import { getAccessToken } from '@/lib/supabase'

/**
 * Klient parsowania. Cała robota (pobranie strony, JSON-LD → heurystyki → Gemini)
 * dzieje się w /api/parse-recipe — przeglądarka nie może pobrać cudzej strony (CORS),
 * a klucz Gemini musi zostać na serwerze.
 */

/** "kuchnia.pl/x" → "https://kuchnia.pl/x" */
export function normalizeUrl(raw: string): string {
  const t = raw.trim()
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`
}

export interface ParseResult {
  draft: RecipeDraft
  origin: ParseOrigin
  /** Liczbę porcji oszacowało AI, bo źródło jej nie podawało */
  servingsEstimated: boolean
  /** Film miał miniaturkę, ale nie udało się jej zapisać */
  thumbnailFailed: boolean
}

export async function parseRecipeFromUrl(rawUrl: string): Promise<ParseResult> {
  // Endpoint wymaga sesji Supabase (chroni limit Gemini); bez Supabase token jest pusty
  const token = await getAccessToken()

  let res: Response
  try {
    res = await fetch('/api/parse-recipe', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ url: normalizeUrl(rawUrl) }),
    })
  } catch {
    throw new Error('Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.')
  }

  const body = (await res.json().catch(() => null)) as {
    draft?: RecipeDraft
    origin?: ParseOrigin
    servingsEstimated?: boolean
    thumbnailFailed?: boolean
    error?: string
  } | null
  if (!res.ok || !body?.draft) {
    throw new Error(body?.error ?? 'Nie udało się pobrać przepisu.')
  }
  return {
    draft: body.draft,
    origin: body.origin ?? 'page',
    servingsEstimated: body.servingsEstimated ?? false,
    thumbnailFailed: body.thumbnailFailed ?? false,
  }
}
