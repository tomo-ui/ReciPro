import type { VercelRequest, VercelResponse } from '@vercel/node'
import { bearerToken, verifyAccessToken } from './_lib/auth.js'
import { FetchError } from './_lib/fetchHtml.js'
import { cleanImages, cleanPastedText, MAX_IMAGES, MIN_PASTED_CHARS } from './_lib/inputs.js'
import { ParseError, parseRecipeImages, parseRecipeText, parseRecipeUrl } from './_lib/pipeline.js'
import { allow, LIMITS } from './_lib/rateLimit.js'
import { makeAdminClient } from './_lib/supabaseServer.js'

/**
 * POST /api/parse-recipe  { url } | { text } | { images: [{ mimeType, data(base64) }] }
 *   →  { draft, origin: 'page' | 'tiktok-caption' | 'instagram-caption' | 'youtube-caption' | 'post-link' | 'text' | 'image', servingsEstimated }
 * Tekst i zdjęcia (zrzuty ekranu przepisu): czyta je Gemini; zdjęcia nigdzie nie są zapisywane.
 * Strona WWW: pobranie po stronie serwera (omija CORS) i 3-warstwowy pipeline.
 * Link do TikToka: odczyt opisu filmu i wyciągnięcie z niego przepisu (Gemini).
 * Cudzych zdjęć ani miniatur filmów nie zapisujemy ani nie podlinkowujemy (prawa autorskie) — import zwraca sam przepis.
 * GEMINI_API_KEY żyje tylko tutaj. Wymaga nagłówka Authorization: Bearer <token sesji Supabase>, zapisanej zgody
 * użytkownika na przetwarzanie przez AI (user_consents) i mieści się w limitach (rateLimit.ts).
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
  let userId: string | undefined
  if (supabaseUrl && supabaseKey) {
    try {
      const token = bearerToken(req.headers.authorization)
      const user = token ? await verifyAccessToken(token, { url: supabaseUrl, anonKey: supabaseKey }) : null
      if (!user || !token) return res.status(401).json({ error: 'Zaloguj się ponownie.', code: 'unauthorized' })
      userId = user.id
    } catch (e) {
      console.error('[parse-recipe] auth', e)
      return res.status(503).json({ error: 'Nie udało się zweryfikować sesji. Spróbuj za chwilę.', code: 'auth_unavailable' })
    }
  } else if (process.env.VERCEL) {
    console.error('[parse-recipe] brak VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — odmawiam obsługi')
    return res.status(500).json({ error: 'Serwer nie jest poprawnie skonfigurowany.', code: 'misconfigured' })
  }

  // Trzy rodzaje wejścia: zdjęcia (`images`), wklejony tekst (`text`) albo adres (`url`)
  const aiOptions = { geminiApiKey: process.env.GEMINI_API_KEY, geminiModel: process.env.GEMINI_MODEL }
  let run: () => Promise<Awaited<ReturnType<typeof parseRecipeUrl>>>
  if (req.body?.images !== undefined) {
    const images = cleanImages(req.body.images)
    if (!images) {
      return res.status(400).json({ error: `Dodaj od 1 do ${MAX_IMAGES} zdjęć (JPEG, PNG lub WebP) o rozsądnym rozmiarze.`, code: 'invalid_images' })
    }
    run = () => parseRecipeImages(images, aiOptions)
  } else if (req.body?.text !== undefined) {
    const text = cleanPastedText(req.body.text)
    if (!text) {
      return res.status(400).json({ error: `Wklej cały przepis — tekst jest za krótki (min. ${MIN_PASTED_CHARS} znaków).`, code: 'invalid_text' })
    }
    run = () => parseRecipeText(text, aiOptions)
  } else {
    const url = typeof req.body?.url === 'string' ? req.body.url.trim() : ''
    if (!url || url.length > 2048) {
      return res.status(400).json({ error: 'Podaj adres strony z przepisem.', code: 'invalid_url' })
    }
    run = () => parseRecipeUrl(url, { ...aiOptions, youtubeApiKey: process.env.YOUTUBE_API_KEY })
  }

  // Zgoda na AI i limity importów (tabele są dostępne tylko dla klucza service_role). Lokalnie bez Supabase pomijamy.
  if (userId && supabaseUrl) {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
      if (process.env.VERCEL) {
        console.error('[parse-recipe] brak SUPABASE_SERVICE_ROLE_KEY — nie da się sprawdzić zgody ani limitów')
        return res.status(500).json({ error: 'Serwer nie jest poprawnie skonfigurowany.', code: 'misconfigured' })
      }
    } else {
      const admin = makeAdminClient({ url: supabaseUrl, serviceRoleKey })
      const { data: consent, error: consentError } = await admin.from('user_consents').select('ai_consent_at').eq('user_id', userId).maybeSingle()
      if (consentError) {
        console.error('[parse-recipe] zgody:', consentError.message)
        return res.status(503).json({ error: 'Nie udało się sprawdzić zgody. Spróbuj za chwilę.', code: 'consent_unavailable' })
      }
      if (!consent?.ai_consent_at) {
        return res.status(403).json({ error: 'Zanim zaimportujesz przepis, zaakceptuj zgodę na przetwarzanie przez AI.', code: 'consent_required' })
      }
      const withinLimits = (await allow(admin, `import-burst:${userId}`, LIMITS.importBurst)) && (await allow(admin, `import-day:${userId}`, LIMITS.importDay))
      if (!withinLimits) {
        res.setHeader('retry-after', String(LIMITS.importBurst.windowSeconds))
        return res.status(429).json({ error: 'Za dużo importów w krótkim czasie. Odczekaj chwilę — dzienny limit to 40 importów.', code: 'rate_limited' })
      }
    }
  }

  try {
    const { draft, origin, servingsEstimated, servingsBasis } = await run()
    return res.status(200).json({ draft, origin, servingsEstimated, servingsBasis })
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
