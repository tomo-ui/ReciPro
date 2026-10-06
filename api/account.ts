import type { VercelRequest, VercelResponse } from '@vercel/node'
import { deleteUserAccount } from './_lib/account.js'
import { bearerToken } from './_lib/auth.js'
import { allow, clientIp, hashId, LIMITS } from './_lib/rateLimit.js'
import { isForeignOrigin, makeAdminClient } from './_lib/supabaseServer.js'

/**
 * POST /api/account  Authorization: Bearer <token sesji>
 *   { confirm: "<moja nazwa użytkownika>" }                 →  usuwa MOJE konto (wymóg Apple 5.1.1(v) / Google)
 *   { userId: "<uuid>" }                                    →  administrator usuwa cudze konto (moderacja)
 * Operacja jest trwała. Usuwa pliki, kopie autora w cudzych przepisach i konto Auth (reszta idzie kaskadą w bazie).
 * Wymaga klucza service_role, więc działa wyłącznie na serwerze.
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
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    console.error('[account] brak konfiguracji Supabase (w tym SUPABASE_SERVICE_ROLE_KEY)')
    return res.status(500).json({ error: 'Serwer nie jest poprawnie skonfigurowany.', code: 'misconfigured' })
  }

  try {
    const admin = makeAdminClient({ url, serviceRoleKey })

    const token = bearerToken(req.headers.authorization)
    const { data: auth, error: authError } = token ? await admin.auth.getUser(token) : { data: null, error: new Error('no token') }
    const caller = auth?.user
    if (authError || !caller) return res.status(401).json({ error: 'Zaloguj się ponownie.', code: 'unauthorized' })

    if (!(await allow(admin, `delete-ip:${hashId(clientIp(req.headers))}`, LIMITS.deleteIp))) {
      res.setHeader('retry-after', String(LIMITS.deleteIp.windowSeconds))
      return res.status(429).json({ error: 'Zbyt wiele prób. Spróbuj ponownie później.', code: 'rate_limited' })
    }

    const targetId = typeof req.body?.userId === 'string' ? req.body.userId : null

    // — usuwanie cudzego konta: tylko administrator —
    if (targetId && targetId !== caller.id) {
      const { data: adminRow } = await admin.from('app_admins').select('user_id').eq('user_id', caller.id).maybeSingle()
      if (!adminRow) return res.status(403).json({ error: 'Brak uprawnień.', code: 'forbidden' })
      const { data: targetIsAdmin } = await admin.from('app_admins').select('user_id').eq('user_id', targetId).maybeSingle()
      if (targetIsAdmin) return res.status(403).json({ error: 'Nie można usunąć konta administratora.', code: 'forbidden' })

      // Zgłoszenia zamykamy PRZED usunięciem: potem klucz obcy zeruje target_user_id i nie dałoby się ich znaleźć
      await admin
        .from('reports')
        .update({ status: 'resolved', action: 'remove_account', handled_by: caller.id, handled_at: new Date().toISOString() })
        .eq('target_user_id', targetId)
        .eq('status', 'open')
      await deleteUserAccount(admin, targetId)
      return res.status(200).json({ ok: true })
    }

    // — usuwanie własnego konta: wymaga wpisania własnej nazwy użytkownika —
    const confirm = typeof req.body?.confirm === 'string' ? req.body.confirm.trim().toLowerCase() : ''
    const { data: profile } = await admin.from('profiles').select('username').eq('id', caller.id).maybeSingle()
    if (profile && confirm !== (profile.username as string).toLowerCase()) {
      return res.status(400).json({ error: 'Wpisz swoją nazwę użytkownika, żeby potwierdzić.', code: 'confirmation_mismatch' })
    }
    await deleteUserAccount(admin, caller.id)
    return res.status(200).json({ ok: true })
  } catch (e) {
    console.error('[account]', e)
    return res.status(500).json({ error: 'Nie udało się usunąć konta. Spróbuj ponownie.', code: 'internal' })
  }
}
