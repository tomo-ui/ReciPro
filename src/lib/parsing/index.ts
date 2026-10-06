import type { ParseOrigin, RecipeDraft, ThumbnailInfo } from '@/types/recipe'
import { fileToScanImage, type ScanImage } from '@/lib/images'
import { getAccessToken } from '@/lib/supabase'

/**
 * Klient parsowania. Cała robota (pobranie strony, JSON-LD → heurystyki → Gemini, odczyt tekstu i zdjęć)
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
  /** Uzasadnienie szacunku porcji (do pokazania użytkownikowi) */
  servingsBasis?: string
  /** Co się stało z miniaturką posta/filmu */
  thumbnail: ThumbnailInfo
}

/** Ile zdjęć naraz (np. kolejne części długiego przepisu) i jak krótki tekst jest jeszcze sensowny — jak na serwerze */
export const MAX_SCAN_IMAGES = 4
export const MIN_PASTED_CHARS = 30

/** Błąd importu z kodem z serwera (np. consent_required, rate_limited), żeby interfejs mógł zareagować inaczej niż komunikatem */
export class ImportError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message)
    this.name = 'ImportError'
  }
}

async function postParse(payload: Record<string, unknown>): Promise<ParseResult> {
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
      body: JSON.stringify(payload),
    })
  } catch {
    throw new Error('Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.')
  }

  const body = (await res.json().catch(() => null)) as {
    draft?: RecipeDraft
    origin?: ParseOrigin
    servingsEstimated?: boolean
    servingsBasis?: string
    thumbnail?: ThumbnailInfo
    error?: string
    code?: string
  } | null
  if (!res.ok || !body?.draft) {
    if (res.status === 413) throw new Error('Zdjęcia są zbyt duże. Dodaj mniej zdjęć albo mniejsze.')
    throw new ImportError(body?.error ?? 'Nie udało się odczytać przepisu.', body?.code)
  }
  return {
    draft: body.draft,
    origin: body.origin ?? 'page',
    servingsEstimated: body.servingsEstimated ?? false,
    servingsBasis: body.servingsBasis,
    thumbnail: body.thumbnail ?? { status: 'none' },
  }
}

export const parseRecipeFromUrl = (rawUrl: string) => postParse({ url: normalizeUrl(rawUrl) })

/** Cały skopiowany przepis (składniki i przygotowanie w jednym tekście) */
export const parseRecipeFromText = (text: string) => postParse({ text })

/** Zrzuty ekranu / zdjęcia przepisu: zmniejszamy je w przeglądarce i wysyłamy tylko do odczytu (nie są zapisywane) */
export async function parseRecipeFromImages(files: File[]): Promise<ParseResult> {
  const images: ScanImage[] = []
  for (const file of files.slice(0, MAX_SCAN_IMAGES)) images.push(await fileToScanImage(file))
  return postParse({ images })
}
