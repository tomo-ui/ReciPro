import type { VercelRequest, VercelResponse } from '@vercel/node'
import { bearerToken, verifyAccessToken } from './_lib/auth.js'
import { FetchError } from './_lib/fetchHtml.js'
import type { StorageConfig } from './_lib/image.js'
import { ParseError, parseRecipeUrl } from './_lib/pipeline.js'

/**
 * POST /api/parse-recipe  { url }  →  { draft, origin: 'page' | 'tiktok-caption' | 'instagram-caption' | 'youtube-caption' | 'post-link', servingsEstimated, thumbnail }
 * Strona WWW: pobranie po stronie serwera (omija CORS) i 3-warstwowy pipeline.
 * Link do TikToka: odczyt opisu filmu i wyciągnięcie z niego przepisu (Gemini).
 * GEMINI_API_KEY żyje tylko tutaj. Wymaga nagłówka Authorization: Bearer <token sesji Supabase>.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST')
    return res.status(405).json({ error: 'Metoda niedozwolona.', code: 'method' })
  }

  // Ochrona przed cudzymi stronami wołającymi endpoint z przeglądarki (to nie jest uwierzytelnianie)
  const origin = req.headers.origin
  const originHost = (() => {
    try {
      return origin ? new URL(origin).host : null
    } catch {
      return 'invalid' // np. Origin: null
    }
  })()
  if (originHost && originHost !== req.headers.host) {
    return res.status(403).json({ error: 'Niedozwolone źródło żądania.', code: 'origin' })
  }

  // Uwierzytelnianie: endpoint zużywa limit Gemini, więc wymaga sesji Supabase.
  // Bez konfiguracji działa tylko lokalnie — na Vercelu brak konfiguracji = odmowa (fail closed).
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
  let storage: StorageConfig | undefined // do zapisu miniaturek jako zalogowany użytkownik
  if (supabaseUrl && supabaseKey) {
    try {
      const token = bearerToken(req.headers.authorization)
      const user = token ? await verifyAccessToken(token, { url: supabaseUrl, anonKey: supabaseKey }) : null
      if (!user || !token) return res.status(401).json({ error: 'Zaloguj się ponownie.', code: 'unauthorized' })
      storage = { supabaseUrl, anonKey: supabaseKey, userToken: token, userId: user.id }
    } catch (e) {
      console.error('[parse-recipe] auth', e)
      return res.status(503).json({ error: 'Nie udało się zweryfikować sesji. Spróbuj za chwilę.', code: 'auth_unavailable' })
    }
  } else if (process.env.VERCEL) {
    console.error('[parse-recipe] brak VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — odmawiam obsługi')
    return res.status(500).json({ error: 'Serwer nie jest poprawnie skonfigurowany.', code: 'misconfigured' })
  }

  const url = typeof req.body?.url === 'string' ? req.body.url.trim() : ''
  if (!url || url.length > 2048) {
    return res.status(400).json({ error: 'Podaj adres strony z przepisem.', code: 'invalid_url' })
  }

  try {
    const { draft, origin, servingsEstimated, servingsBasis, thumbnail } = await parseRecipeUrl(url, {
      geminiApiKey: process.env.GEMINI_API_KEY,
      geminiModel: process.env.GEMINI_MODEL,
      storage,
    })
    return res.status(200).json({ draft, origin, servingsEstimated, servingsBasis, thumbnail })
  } catch (e) {
    if (e instanceof FetchError) {
      const status = e.code === 'timeout' ? 504 : e.code === 'invalid_url' || e.code === 'blocked' ? 400 : 502
      return res.status(status).json({ error: e.message, code: e.code })
    }
    if (e instanceof ParseError) {
      const status =
        e.code === 'no_recipe' || e.code === 'no_recipe_in_caption' ? 422 : e.code === 'ai_unavailable' ? 503 : 502
      return res.status(status).json({ error: e.message, code: e.code })
    }
    console.error('[parse-recipe]', e)
    return res.status(500).json({ error: 'Wystąpił nieoczekiwany błąd.', code: 'internal' })
  }
}
