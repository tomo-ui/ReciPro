import type { VercelRequest, VercelResponse } from '@vercel/node'
import { allow, clientIp, hashId, LIMITS } from './_lib/rateLimit.js'
import { emailForUsername, isForeignOrigin, looksLikeEmail, makeServerClients, normalizeEmail } from './_lib/supabaseServer.js'

/**
 * POST /api/forgot-password  { username }  →  { ok: true } (zawsze, niezależnie od wyniku)
 * `username` to nazwa użytkownika albo adres e-mail. Nazwę tłumaczy na e-mail po stronie serwera i wysyła link resetu hasła —
 * e-mail nigdy nie trafia do przeglądarki. Odpowiedź jest zawsze taka sama, żeby nie zdradzać,
 * czy dana nazwa użytkownika w ogóle istnieje.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST')
    return res.status(405).json({ error: 'Metoda niedozwolona.', code: 'method' })
  }
  if (isForeignOrigin(req.headers.origin, req.headers.host)) {
    return res.status(403).json({ error: 'Niedozwolone źródło żądania.', code: 'origin' })
  }

  const url = process.env.VITE_SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceRoleKey) {
    console.error('[forgot-password] brak konfiguracji Supabase (w tym SUPABASE_SERVICE_ROLE_KEY)')
    return res.status(500).json({ error: 'Serwer nie jest poprawnie skonfigurowany.', code: 'misconfigured' })
  }

  const username = typeof req.body?.username === 'string' ? req.body.username.trim().slice(0, 254) : ''
  if (!username) return res.status(200).json({ ok: true })

  try {
    const { anon, admin } = makeServerClients({ url, anonKey, serviceRoleKey })

    // Po przekroczeniu limitu nie wysyłamy maila, ale odpowiadamy tak samo — limit nie może zdradzać, czy konto istnieje
    const withinLimits =
      (await allow(admin, `reset-ip:${hashId(clientIp(req.headers))}`, LIMITS.resetIp)) &&
      (await allow(admin, `reset-user:${hashId(username)}`, LIMITS.resetUser))
    if (!withinLimits) return res.status(200).json({ ok: true })

    // Dla adresu e-mail Supabase sam nic nie wyśle, jeśli konta nie ma — odpowiedź i tak jest zawsze taka sama
    const email = looksLikeEmail(username) ? normalizeEmail(username) : await emailForUsername(admin, username)
    if (email) {
      const redirectTo = req.headers.origin ?? `https://${req.headers.host}`
      await anon.auth.resetPasswordForEmail(email, { redirectTo })
    }
  } catch (e) {
    console.error('[forgot-password]', e) // nie ujawniamy klientowi — komunikat i tak jest neutralny
  }
  return res.status(200).json({ ok: true })
}
