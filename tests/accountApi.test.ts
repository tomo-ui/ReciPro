import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

/** Usuwanie konta, limity zapytań i zgoda na AI po stronie serwera (api/account.ts, api/_lib/*, api/parse-recipe.ts) */

interface Call {
  what: string
  args?: unknown
}

/** Atrapa klienta service_role: tylko to, czego używają endpointy; zapisuje wywołania w kolejności */
function fakeAdmin(o: {
  user?: { id: string } | null
  admins?: string[]
  username?: string | null
  consent?: string | null
  consentError?: boolean
  limit?: (key: string) => boolean
  files?: number
  deleteUserError?: boolean
  listError?: boolean
} = {}) {
  const calls: Call[] = []
  let remaining = o.files ?? 0
  const filters: Record<string, unknown> = {}

  const from = (table: string) => {
    const chain = {
      select: () => chain,
      update: (values: unknown) => {
        calls.push({ what: `update:${table}`, args: values })
        return chain
      },
      eq: (col: string, val: unknown) => {
        filters[`${table}.${col}`] = val
        return chain
      },
      maybeSingle: async () => {
        if (table === 'app_admins') return { data: (o.admins ?? []).includes(String(filters['app_admins.user_id'])) ? { user_id: filters['app_admins.user_id'] } : null }
        if (table === 'profiles') return { data: o.username ? { username: o.username } : null }
        if (table === 'user_consents') return o.consentError ? { data: null, error: { message: 'boom' } } : { data: o.consent ? { ai_consent_at: o.consent } : null, error: null }
        return { data: null }
      },
      then: (resolve: (v: { error: null }) => unknown) => resolve({ error: null }),
    }
    return chain
  }

  const admin = {
    from,
    rpc: async (fn: string, args: { p_key: string }) => {
      calls.push({ what: `rpc:${fn}`, args: args.p_key })
      return { data: o.limit ? o.limit(args.p_key) : true, error: null }
    },
    storage: {
      from: () => ({
        list: async (folder: string) => {
          calls.push({ what: 'storage.list', args: folder })
          if (o.listError) return { data: null, error: { message: 'no bucket' } }
          const batch = Math.min(remaining, 100)
          return { data: Array.from({ length: batch }, (_, i) => ({ id: `id${i}`, name: `f${remaining - i}.jpg` })), error: null }
        },
        remove: async (paths: string[]) => {
          calls.push({ what: 'storage.remove', args: paths.length })
          remaining -= paths.length
          return { error: null }
        },
      }),
    },
    auth: {
      getUser: async () => (o.user === null ? { data: { user: null }, error: { message: 'bad token' } } : { data: { user: o.user ?? { id: 'me' } }, error: null }),
      admin: {
        deleteUser: async (id: string) => {
          calls.push({ what: 'auth.deleteUser', args: id })
          return o.deleteUserError ? { error: { message: 'cannot delete' } } : { error: null }
        },
      },
    },
  }
  return { admin, calls }
}

let current: ReturnType<typeof fakeAdmin>

vi.mock('../api/_lib/supabaseServer', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api/_lib/supabaseServer')>()
  return {
    ...real,
    makeAdminClient: () => current.admin,
    makeServerClients: () => ({ anon: fakeAnon, admin: current.admin }),
    emailForUsername: async (_admin: unknown, username: string) => (username.toLowerCase() === 'anna' ? 'anna@example.com' : null),
  }
})
const fakeAnon = {
  auth: {
    signInWithPassword: async ({ password }: { password: string }) =>
      password === 'dobre-haslo' ? { data: { session: { access_token: 'AT', refresh_token: 'RT' } }, error: null } : { data: { session: null }, error: { message: 'Invalid login credentials' } },
    resetPasswordForEmail: vi.fn(async () => ({ error: null })),
  },
}
vi.mock('../api/_lib/auth', () => ({
  bearerToken: (h: string | undefined) => h?.replace(/^Bearer /i, '') ?? null,
  verifyAccessToken: async (token: string) => (token === 'good' ? { id: 'me' } : null),
}))
const parseSpy = vi.fn()
vi.mock('../api/_lib/pipeline', () => ({
  ParseError: class ParseError extends Error {},
  parseRecipeUrl: (...a: unknown[]) => parseSpy('url', ...a),
  parseRecipeText: (...a: unknown[]) => parseSpy('text', ...a),
  parseRecipeImages: (...a: unknown[]) => parseSpy('images', ...a),
}))

import { deleteUserAccount } from '../api/_lib/account'
import { allow, clientIp, hashId, LIMITS } from '../api/_lib/rateLimit'
import accountHandler from '../api/account'
import parseHandler from '../api/parse-recipe'
import loginHandler from '../api/login'
import forgotHandler from '../api/forgot-password'

function call(handler: (req: VercelRequest, res: VercelResponse) => unknown, req: Partial<VercelRequest>) {
  const out: { status: number; body: unknown; headers: Record<string, string> } = { status: 200, body: undefined, headers: {} }
  const res = {
    status(code: number) {
      out.status = code
      return res
    },
    json(body: unknown) {
      out.body = body
      return res
    },
    setHeader(k: string, v: string) {
      out.headers[k.toLowerCase()] = v
      return res
    },
  }
  return Promise.resolve(handler({ method: 'POST', headers: { host: 'recipro.app', authorization: 'Bearer good' }, body: {}, ...req } as VercelRequest, res as unknown as VercelResponse)).then(() => out)
}

beforeEach(() => {
  process.env.VITE_SUPABASE_URL = 'https://abc.supabase.co'
  process.env.VITE_SUPABASE_ANON_KEY = 'anon'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service'
  process.env.GEMINI_API_KEY = 'g'
  delete process.env.VERCEL
  parseSpy.mockReset()
  parseSpy.mockResolvedValue({ draft: { title: 'x', ingredients: [], steps: [], tags: [], parse_method: 'gemini' }, origin: 'text', servingsEstimated: false })
})

describe('deleteUserAccount', () => {
  it('najpierw pliki, potem anonimizacja cudzych kopii, na końcu konto Auth', async () => {
    const f = fakeAdmin({ files: 3 })
    await deleteUserAccount(f.admin as never, 'u1')
    expect(f.calls.map((c) => c.what)).toEqual(['storage.list', 'storage.remove', 'update:recipes', 'auth.deleteUser'])
    expect(f.calls.find((c) => c.what === 'update:recipes')?.args).toEqual({ saved_from_username: null })
    expect(f.calls.at(-1)?.args).toBe('u1')
  })

  it('usuwa pliki partiami po 100 (folder użytkownika)', async () => {
    const f = fakeAdmin({ files: 230 })
    await deleteUserAccount(f.admin as never, 'u1')
    const removed = f.calls.filter((c) => c.what === 'storage.remove').map((c) => c.args)
    expect(removed).toEqual([100, 100, 30])
    expect(f.calls.find((c) => c.what === 'storage.list')?.args).toBe('u1')
  })

  it('błąd na liście plików przerywa operację PRZED usunięciem konta (można powtórzyć)', async () => {
    const f = fakeAdmin({ listError: true })
    await expect(deleteUserAccount(f.admin as never, 'u1')).rejects.toThrow(/lista plików/)
    expect(f.calls.some((c) => c.what === 'auth.deleteUser')).toBe(false)
  })

  it('błąd usunięcia konta Auth jest zgłaszany', async () => {
    const f = fakeAdmin({ deleteUserError: true })
    await expect(deleteUserAccount(f.admin as never, 'u1')).rejects.toThrow(/usuwanie konta/)
  })
})

describe('POST /api/account', () => {
  it('własne konto: wymaga wpisania własnej nazwy użytkownika', async () => {
    current = fakeAdmin({ username: 'Anna_Gotuje' })
    const bad = await call(accountHandler, { body: { confirm: 'ktos.inny' } })
    expect(bad.status).toBe(400)
    expect(bad.body).toMatchObject({ code: 'confirmation_mismatch' })
    expect(current.calls.some((c) => c.what === 'auth.deleteUser')).toBe(false)

    const ok = await call(accountHandler, { body: { confirm: ' anna_gotuje ' } })
    expect(ok.status).toBe(200)
    expect(current.calls.some((c) => c.what === 'auth.deleteUser' && c.args === 'me')).toBe(true)
  })

  it('konto bez profilu można usunąć bez wpisywania nazwy', async () => {
    current = fakeAdmin({ username: null })
    expect((await call(accountHandler, { body: {} })).status).toBe(200)
  })

  it('bez ważnej sesji: 401, nic nie jest usuwane', async () => {
    current = fakeAdmin({ user: null })
    const res = await call(accountHandler, { headers: { host: 'recipro.app' }, body: {} })
    expect(res.status).toBe(401)
    expect(current.calls.some((c) => c.what === 'auth.deleteUser')).toBe(false)
  })

  it('cudzym kontem zajmuje się tylko administrator; konta administratora nie da się usunąć', async () => {
    current = fakeAdmin({ admins: [] })
    expect((await call(accountHandler, { body: { userId: 'victim' } })).status).toBe(403)

    current = fakeAdmin({ admins: ['me', 'other-admin'] })
    expect((await call(accountHandler, { body: { userId: 'other-admin' } })).status).toBe(403)

    current = fakeAdmin({ admins: ['me'] })
    const ok = await call(accountHandler, { body: { userId: 'victim' } })
    expect(ok.status).toBe(200)
    const order = current.calls.map((c) => c.what)
    // zgłoszenia zamykamy przed usunięciem konta (potem klucz obcy zeruje target_user_id)
    expect(order.indexOf('update:reports')).toBeGreaterThan(-1)
    expect(order.indexOf('update:reports')).toBeLessThan(order.indexOf('auth.deleteUser'))
    expect(current.calls.find((c) => c.what === 'auth.deleteUser')?.args).toBe('victim')
  })

  it('limit prób: 429 z Retry-After; obcy Origin i inna metoda są odrzucane', async () => {
    current = fakeAdmin({ username: 'anna', limit: () => false })
    const limited = await call(accountHandler, { body: { confirm: 'anna' } })
    expect(limited.status).toBe(429)
    expect(limited.headers['retry-after']).toBe(String(LIMITS.deleteIp.windowSeconds))
    expect(current.calls.some((c) => c.what === 'auth.deleteUser')).toBe(false)

    current = fakeAdmin({ username: 'anna' })
    expect((await call(accountHandler, { headers: { host: 'recipro.app', origin: 'https://zla.pl', authorization: 'Bearer good' }, body: {} })).status).toBe(403)
    expect((await call(accountHandler, { method: 'GET' })).status).toBe(405)
  })

  it('błąd usuwania daje 500 z czytelnym komunikatem', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    current = fakeAdmin({ username: null, deleteUserError: true })
    const res = await call(accountHandler, { body: {} })
    expect(res.status).toBe(500)
    expect(res.body).toMatchObject({ code: 'internal' })
  })
})

describe('rateLimit', () => {
  it('clientIp bierze pierwszy adres z nagłówków proxy, a hashId nie zdradza wejścia i ignoruje wielkość liter', () => {
    expect(clientIp({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' })).toBe('1.2.3.4')
    expect(clientIp({ 'x-vercel-forwarded-for': '5.6.7.8', 'x-forwarded-for': '1.2.3.4' })).toBe('5.6.7.8')
    expect(clientIp({})).toBe('unknown')
    expect(hashId(' Anna ')).toBe(hashId('anna'))
    expect(hashId('anna')).toMatch(/^[0-9a-f]{24}$/)
    expect(hashId('anna')).not.toContain('anna')
  })

  it('allow: wynik z bazy; awaria bazy przepuszcza (fail-open) i głośno loguje', async () => {
    expect(await allow(fakeAdmin({ limit: () => true }).admin as never, 'k', LIMITS.loginIp)).toBe(true)
    expect(await allow(fakeAdmin({ limit: () => false }).admin as never, 'k', LIMITS.loginIp)).toBe(false)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const broken = { rpc: async () => ({ data: null, error: { message: 'function does not exist' } }) }
    expect(await allow(broken as never, 'k', LIMITS.loginIp)).toBe(true)
    expect(spy).toHaveBeenCalled()
  })
})

describe('POST /api/parse-recipe: zgoda na AI i limity', () => {
  const body = { text: 'Składniki: mąka, mleko, jajka. Przygotowanie: wymieszać i smażyć na patelni.' }

  it('bez zgody: 403 consent_required, AI nie jest wołane', async () => {
    current = fakeAdmin({ consent: null })
    const res = await call(parseHandler, { body })
    expect(res.status).toBe(403)
    expect(res.body).toMatchObject({ code: 'consent_required' })
    expect(parseSpy).not.toHaveBeenCalled()
    expect(current.calls.some((c) => c.what.startsWith('rpc:'))).toBe(false) // odmowa nie zużywa limitu
  })

  it('ze zgodą: import działa i zużywa limity (seria + doba) na użytkownika', async () => {
    current = fakeAdmin({ consent: '2026-10-06T10:00:00Z' })
    const res = await call(parseHandler, { body })
    expect(res.status).toBe(200)
    expect(parseSpy).toHaveBeenCalledTimes(1)
    expect(current.calls.filter((c) => c.what === 'rpc:consume_rate_limit').map((c) => c.args)).toEqual(['import-burst:me', 'import-day:me'])
  })

  it('limit wyczerpany: 429, AI nie jest wołane', async () => {
    current = fakeAdmin({ consent: '2026-10-06T10:00:00Z', limit: () => false })
    const res = await call(parseHandler, { body })
    expect(res.status).toBe(429)
    expect(res.body).toMatchObject({ code: 'rate_limited' })
    expect(parseSpy).not.toHaveBeenCalled()
  })

  it('niepoprawne wejście nie zużywa limitu ani nie pyta o zgodę; błąd sprawdzania zgody to 503', async () => {
    current = fakeAdmin({ consent: '2026-10-06T10:00:00Z' })
    expect((await call(parseHandler, { body: { text: 'za krótko' } })).status).toBe(400)
    expect(current.calls.some((c) => c.what.startsWith('rpc:'))).toBe(false)

    vi.spyOn(console, 'error').mockImplementation(() => {})
    current = fakeAdmin({ consentError: true })
    expect((await call(parseHandler, { body })).status).toBe(503)
  })

  it('bez ważnej sesji: 401; na Vercelu bez klucza service_role: odmowa (fail closed)', async () => {
    current = fakeAdmin({ consent: '2026-10-06T10:00:00Z' })
    expect((await call(parseHandler, { headers: { host: 'recipro.app', authorization: 'Bearer zly' }, body })).status).toBe(401)

    vi.spyOn(console, 'error').mockImplementation(() => {})
    process.env.VERCEL = '1'
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    expect((await call(parseHandler, { body })).status).toBe(500)
    expect(parseSpy).not.toHaveBeenCalled()
  })
})

describe('limity logowania i resetu hasła', () => {
  it('login: limit na IP i na nazwę (klucze to skróty), po przekroczeniu 429 bez sprawdzania hasła', async () => {
    current = fakeAdmin({})
    const ok = await call(loginHandler, { headers: { host: 'recipro.app', 'x-forwarded-for': '9.9.9.9' }, body: { username: 'Anna', password: 'dobre-haslo' } })
    expect(ok.status).toBe(200)
    const keys = current.calls.filter((c) => c.what === 'rpc:consume_rate_limit').map((c) => String(c.args))
    expect(keys).toEqual([`login-ip:${hashId('9.9.9.9')}`, `login-user:${hashId('Anna')}`])
    expect(keys.join()).not.toContain('9.9.9.9')

    current = fakeAdmin({ limit: (k) => !k.startsWith('login-user:') })
    const limited = await call(loginHandler, { headers: { host: 'recipro.app' }, body: { username: 'anna', password: 'dobre-haslo' } })
    expect(limited.status).toBe(429)
    expect(limited.body).toMatchObject({ code: 'rate_limited' })
    expect(limited.headers['retry-after']).toBeDefined()
  })

  it('login: złe hasło i nieznana nazwa dostają ten sam komunikat (429 nie zdradza istnienia konta)', async () => {
    current = fakeAdmin({})
    const wrong = await call(loginHandler, { headers: { host: 'recipro.app' }, body: { username: 'anna', password: 'zle' } })
    const unknown = await call(loginHandler, { headers: { host: 'recipro.app' }, body: { username: 'nikt', password: 'zle' } })
    expect(wrong.status).toBe(401)
    expect(unknown.body).toEqual(wrong.body)
  })

  it('reset hasła: po przekroczeniu limitu mail nie jest wysyłany, ale odpowiedź jest taka sama', async () => {
    current = fakeAdmin({})
    fakeAnon.auth.resetPasswordForEmail.mockClear()
    const sent = await call(forgotHandler, { headers: { host: 'recipro.app', origin: 'https://recipro.app' }, body: { username: 'anna' } })
    expect(sent.body).toEqual({ ok: true })
    expect(fakeAnon.auth.resetPasswordForEmail).toHaveBeenCalledTimes(1)

    current = fakeAdmin({ limit: () => false })
    fakeAnon.auth.resetPasswordForEmail.mockClear()
    const dropped = await call(forgotHandler, { headers: { host: 'recipro.app' }, body: { username: 'anna' } })
    expect(dropped.status).toBe(200)
    expect(dropped.body).toEqual({ ok: true })
    expect(fakeAnon.auth.resetPasswordForEmail).not.toHaveBeenCalled()
  })
})
