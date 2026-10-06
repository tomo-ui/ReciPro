import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

/** Klient: zgłaszanie, blokowanie, zgoda na AI i usuwanie konta (supabaseBackend + localBackend) */

type Result = { data: unknown; error: { code?: string; message: string } | null }

const signOut = vi.fn(async () => ({ error: null }))
vi.mock('../src/lib/supabase', () => ({
  supabase: null,
  usesSupabase: true,
  getAccessToken: async () => 'tok-123',
}))

import { createSupabaseBackend } from '../src/lib/supabaseBackend'
import { LOCAL_USER_ID, localBackend } from '../src/lib/localBackend'

function fakeClient(rpc: (name: string, args: Record<string, unknown>) => Result = () => ({ data: null, error: null }), table?: (name: string) => Result) {
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = []
  const chain = (name: string): unknown =>
    new Proxy({}, { get: (_t, prop: string) => (prop === 'then' ? (res: (v: Result) => unknown) => Promise.resolve(table?.(name) ?? { data: null, error: null }).then(res) : () => chain(name)) })
  const client = {
    from: (name: string) => chain(name),
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args })
      return Promise.resolve(rpc(name, args))
    },
    auth: { getSession: async () => ({ data: { session: { user: { id: 'me' } } } }), signOut },
  }
  return { backend: createSupabaseBackend(() => client as unknown as SupabaseClient), rpcCalls }
}

afterEach(() => vi.unstubAllGlobals())

describe('supabaseBackend: moderacja', () => {
  it('reportContent woła report_content z rodzajem, id, powodem i przyciętym opisem', async () => {
    const f = fakeClient()
    await f.backend.reportContent({ type: 'comment', id: 'c-1' }, 'spam', '  to reklama  ')
    await f.backend.reportContent({ type: 'recipe', id: 'r-1' }, 'other')
    expect(f.rpcCalls).toEqual([
      { name: 'report_content', args: { p_type: 'comment', p_id: 'c-1', p_reason: 'spam', p_details: 'to reklama' } },
      { name: 'report_content', args: { p_type: 'recipe', p_id: 'r-1', p_reason: 'other', p_details: null } },
    ])
  })

  it('błędy z bazy po polsku: własna treść, limit zgłoszeń, brak celu', async () => {
    for (const [message, expected] of [
      ['cannot report own content', /własnej treści/],
      ['too many reports', /Zbyt wiele zgłoszeń/],
      ['target not found', /nie jest już dostępna/],
    ] as const) {
      const f = fakeClient(() => ({ data: null, error: { message } }))
      await expect(f.backend.reportContent({ type: 'recipe', id: 'x' }, 'spam')).rejects.toThrow(expected)
    }
  })

  it('blockUser / unblockUser / listBlockedUsers korzystają z funkcji SQL i mapują wiersze', async () => {
    const f = fakeClient((name) =>
      name === 'list_blocked_users' ? { data: [{ id: 'u1', username: 'jan', full_name: null, avatar_url: 'a.jpg', blocked_at: '2026-10-06T10:00:00Z' }], error: null } : { data: null, error: null },
    )
    await f.backend.blockUser('u1')
    await f.backend.unblockUser('u1')
    expect(await f.backend.listBlockedUsers(0, 30)).toEqual([{ id: 'u1', username: 'jan', full_name: undefined, avatar_url: 'a.jpg', blocked_at: '2026-10-06T10:00:00Z' }])
    expect(f.rpcCalls.map((c) => c.name)).toEqual(['block_user', 'unblock_user', 'list_blocked_users'])
    expect(f.rpcCalls[0].args).toEqual({ p_user: 'u1' })
    expect(f.rpcCalls[2].args).toEqual({ p_limit: 30, p_offset: 0 })
  })

  it('panel admina: lista zgłoszeń z mapowaniem pól, licznik 0 dla zwykłego użytkownika', async () => {
    const f = fakeClient((name) =>
      name === 'admin_list_reports'
        ? {
            data: [{ id: 'r1', target_type: 'recipe', target_id: 't', target_user_id: null, target_username: 'anna', excerpt: 'Sernik', reason: 'spam', details: null, status: 'open', action: null, created_at: 'x', reporter_username: null, reports_count: 2 }],
            error: null,
          }
        : { data: null, error: { message: 'permission denied' } },
    )
    expect(await f.backend.listReports('open', 0, 20)).toEqual([
      { id: 'r1', target_type: 'recipe', target_id: 't', target_user_id: undefined, target_username: 'anna', excerpt: 'Sernik', reason: 'spam', details: undefined, status: 'open', action: undefined, created_at: 'x', reporter_username: undefined, reports_count: 2 },
    ])
    expect(f.rpcCalls[0]).toEqual({ name: 'admin_list_reports', args: { p_status: 'open', p_limit: 20, p_offset: 0 } })
    expect(await f.backend.countOpenReports()).toBe(0)
  })
})

describe('supabaseBackend: zgoda na AI', () => {
  it('getAiConsent: true tylko gdy zapisano datę zgody; setAiConsent przekazuje wersję treści', async () => {
    expect(await fakeClient(undefined, () => ({ data: { ai_consent_at: '2026-10-06T10:00:00Z' }, error: null })).backend.getAiConsent()).toBe(true)
    expect(await fakeClient(undefined, () => ({ data: { ai_consent_at: null }, error: null })).backend.getAiConsent()).toBe(false)
    expect(await fakeClient(undefined, () => ({ data: null, error: null })).backend.getAiConsent()).toBe(false)

    const f = fakeClient()
    await f.backend.setAiConsent(true)
    await f.backend.setAiConsent(false)
    expect(f.rpcCalls).toEqual([
      { name: 'set_ai_consent', args: { p_granted: true, p_version: 1 } },
      { name: 'set_ai_consent', args: { p_granted: false, p_version: 1 } },
    ])
  })
})

describe('supabaseBackend: usuwanie konta', () => {
  it('woła /api/account z tokenem sesji i wpisaną nazwą, a potem czyści sesję lokalnie', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    signOut.mockClear()
    await fakeClient().backend.deleteAccount('anna')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/account')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok-123')
    expect(JSON.parse(init.body as string)).toEqual({ confirm: 'anna' })
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('błąd serwera: komunikat z odpowiedzi, sesja zostaje (konto nie zostało usunięte)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Wpisz swoją nazwę użytkownika, żeby potwierdzić.' }), { status: 400 })))
    signOut.mockClear()
    await expect(fakeClient().backend.deleteAccount('zle')).rejects.toThrow(/Wpisz swoją nazwę/)
    expect(signOut).not.toHaveBeenCalled()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline')
      }),
    )
    await expect(fakeClient().backend.deleteAccount('a')).rejects.toThrow(/Brak połączenia/)
  })

  it('administrator usuwa cudze konto przez ten sam endpoint (userId)', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await fakeClient().backend.removeUserAccount('victim')
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ userId: 'victim' })
  })
})

describe('tryb lokalny: blokowanie, zgłoszenia i zgoda', () => {
  it('zablokowany przykładowy użytkownik znika z profili i wyszukiwarki, odblokowanie go przywraca', async () => {
    const zosia = (await localBackend.getProfile('kuchnia.zosi'))!
    await localBackend.follow(zosia.id)
    await localBackend.blockUser(zosia.id)
    expect(await localBackend.getProfile('kuchnia.zosi')).toBeNull()
    expect((await localBackend.searchProfiles('zosi', 0, 10)).map((p) => p.username)).not.toContain('kuchnia.zosi')
    expect((await localBackend.listBlockedUsers(0, 10)).map((u) => u.username)).toEqual(['kuchnia.zosi'])

    await localBackend.unblockUser(zosia.id)
    const back = await localBackend.getProfile('kuchnia.zosi')
    expect(back).not.toBeNull()
    expect(back?.is_following).toBe(false) // blokada zakończyła obserwowanie
    expect(await localBackend.listBlockedUsers(0, 10)).toEqual([])
  })

  it('nie da się zablokować samego siebie', async () => {
    await expect(localBackend.blockUser(LOCAL_USER_ID)).rejects.toThrow(/samego siebie/)
  })

  it('zgoda na AI: domyślnie brak, zapis i cofnięcie', async () => {
    expect(await localBackend.getAiConsent()).toBe(false)
    await localBackend.setAiConsent(true)
    expect(await localBackend.getAiConsent()).toBe(true)
    await localBackend.setAiConsent(false)
    expect(await localBackend.getAiConsent()).toBe(false)
  })

  it('zgłoszenia (tryb demo): zwykły użytkownik zgłasza, panel jest tylko dla admina', async () => {
    await localBackend.reportContent({ type: 'recipe', id: 'demo-anna-2' }, 'spam', 'reklama')
    await localBackend.reportContent({ type: 'recipe', id: 'demo-anna-2' }, 'spam') // duplikat jest ignorowany
    expect(await localBackend.countOpenReports()).toBe(0)
    await expect(localBackend.listReports('open', 0, 10)).rejects.toThrow(/uprawnień/)
  })
})
