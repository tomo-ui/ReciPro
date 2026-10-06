import type { VercelRequest, VercelResponse } from '@vercel/node'
import { allow, clientIp, hashId, LIMITS } from './_lib/rateLimit.js'
import { emailForUsername, isForeignOrigin, makeServerClients } from './_lib/supabaseServer.js'

const GENERIC_ERROR = 'Nieprawidłowa nazwa użytkownika lub hasło.'

/**
 * POST /api/login  { username, password }  →  { access_token, refresh_token }
 * Tłumaczy nazwę użytkownika na e-mail i loguje po stronie serwera (klucz service_role) —
 * e-mail NIGDY nie trafia do przeglądarki. Zastępuje dawne wywołanie RPC `email_for_username`
 * z klienta, które wyciekało e-maile każdemu, kto znał czyjąś nazwę użytkownika.
 * Nieznana nazwa dostaje ten sam komunikat co złe hasło — bez ujawniania, czy konto istnieje.
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
    console.error('[login] brak konfiguracji Supabase (w tym SUPABASE_SERVICE_ROLE_KEY)')
    return res.status(500).json({ error: 'Serwer nie jest poprawnie skonfigurowany.', code: 'misconfigured' })
  }

  const username = typeof req.body?.username === 'string' ? req.body.username.trim().slice(0, 60) : ''
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  if (!username || !password) {
    return res.status(401).json({ error: GENERIC_ERROR, code: 'invalid_credentials' })
  }

  try {
    const { anon, admin } = makeServerClients({ url, anonKey, serviceRoleKey })

    // Limity prób: osobno na adres IP i na nazwę użytkownika (zgadywanie haseł jednego konta z wielu adresów)
    const withinLimits =
      (await allow(admin, `login-ip:${hashId(clientIp(req.headers))}`, LIMITS.loginIp)) &&
      (await allow(admin, `login-user:${hashId(username)}`, LIMITS.loginUser))
    if (!withinLimits) {
      res.setHeader('retry-after', String(LIMITS.loginUser.windowSeconds))
      return res.status(429).json({ error: 'Zbyt wiele prób logowania. Spróbuj ponownie za kilkanaście minut.', code: 'rate_limited' })
    }

    const email = await emailForUsername(admin, username)
    if (!email) {
      return res.status(401).json({ error: GENERIC_ERROR, code: 'invalid_credentials' })
    }

    const { data, error } = await anon.auth.signInWithPassword({ email, password })
    if (error || !data.session) {
      // Konto nieotwierdzone dostaje własny kod, żeby klient mógł zaproponować wysłanie linku ponownie
      if (error?.code === 'email_not_confirmed') {
        return res.status(401).json({ error: error.message, code: 'email_not_confirmed' })
      }
      return res.status(401).json({ error: GENERIC_ERROR, code: 'invalid_credentials' })
    }

    return res.status(200).json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    })
  } catch (e) {
    console.error('[login]', e)
    return res.status(500).json({ error: 'Wystąpił nieoczekiwany błąd.', code: 'internal' })
  }
}
