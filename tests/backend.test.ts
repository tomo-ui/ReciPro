import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseBackend } from '../src/lib/supabaseBackend'

/**
 * Atrapa klienta Supabase: każde zapytanie zapisuje wywołania łańcucha (from/insert/eq…)
 * i zwraca wynik ustawiony w teście. Sprawdzamy mapowanie i reguły po stronie aplikacji.
 */
type Result = { data: unknown; error: { code?: string; message: string } | null }
interface Call { table?: string; ops: [string, unknown[]][] }

function fake(opts: { results?: (call: Call) => Result; rpc?: (name: string, args: unknown) => Result } = {}) {
  const calls: Call[] = []
  const rpcCalls: { name: string; args: unknown }[] = []
  const channels: { name: string; listeners: { type: string; filter: unknown; cb: (p: unknown) => void }[]; subscribed: boolean }[] = []
  const removed: unknown[] = []

  const builder = (table: string) => {
    const call: Call = { table, ops: [] }
    calls.push(call)
    const proxy: unknown = new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === 'then') {
            const result = opts.results?.(call) ?? { data: [], error: null }
            return (res: (v: Result) => unknown) => Promise.resolve(result).then(res)
          }
          return (...args: unknown[]) => {
            call.ops.push([prop, args])
            return proxy
          }
        },
      },
    )
    return proxy
  }

  const client = {
    from: builder,
    rpc: (name: string, args: unknown) => {
      rpcCalls.push({ name, args })
      return Promise.resolve(opts.rpc?.(name, args) ?? { data: [], error: null })
    },
    auth: { getSession: async () => ({ data: { session: { user: { id: 'me' } } } }) },
    channel: (name: string) => {
      const ch = { name, listeners: [] as { type: string; filter: unknown; cb: (p: unknown) => void }[], subscribed: false }
      channels.push(ch)
      const api = {
        on: (type: string, filter: unknown, cb: (p: unknown) => void) => {
          ch.listeners.push({ type, filter, cb })
          return api
        },
        subscribe: () => {
          ch.subscribed = true
          return api
        },
        __ch: ch,
      }
      return api
    },
    removeChannel: (api: { __ch: unknown }) => removed.push(api.__ch),
  }
  return { backend: createSupabaseBackend(() => client as unknown as SupabaseClient), calls, rpcCalls, channels, removed }
}

const ok = (data: unknown): Result => ({ data, error: null })

describe('liczniki na żywo (Realtime)', () => {
  it('nasłuchuje zmian wiersza profilu i przekazuje oba liczniki', () => {
    const f = fake()
    const got: unknown[] = []
    f.backend.subscribeProfileCounts('u-1', (c) => got.push(c))

    expect(f.channels).toHaveLength(1)
    const ch = f.channels[0]
    expect(ch.subscribed).toBe(true)
    expect(ch.listeners).toHaveLength(1)
    expect(ch.listeners[0].type).toBe('postgres_changes')
    expect(ch.listeners[0].filter).toEqual({ event: 'UPDATE', schema: 'public', table: 'profiles', filter: 'id=eq.u-1' })

    ch.listeners[0].cb({ new: { id: 'u-1', followers_count: 12, following_count: 3, username: 'x' } })
    expect(got).toEqual([{ followers_count: 12, following_count: 3 }])
  })

  it('ignoruje zdarzenia bez liczników (np. zmiana imienia z niepełnym rekordem)', () => {
    const f = fake()
    const got: unknown[] = []
    f.backend.subscribeProfileCounts('u-1', (c) => got.push(c))
    f.channels[0].listeners[0].cb({ new: { followers_count: 5 } })
    f.channels[0].listeners[0].cb({ new: { followers_count: '5', following_count: '2' } })
    f.channels[0].listeners[0].cb({ new: {} })
    expect(got).toEqual([])
  })

  it('zwrócona funkcja kończy nasłuchiwanie; każda subskrypcja ma własny kanał', () => {
    const f = fake()
    const stop1 = f.backend.subscribeProfileCounts('u-1', () => {})
    const stop2 = f.backend.subscribeProfileCounts('u-1', () => {})
    expect(f.channels[0].name).not.toBe(f.channels[1].name)
    stop1()
    expect(f.removed).toEqual([f.channels[0]])
    stop2()
    expect(f.removed).toHaveLength(2)
  })
})

describe('polubienia', () => {
  it('getRecipeStats: mapuje wiersze i pomija puste zapytanie', async () => {
    const f = fake({ rpc: () => ok([{ recipe_id: 'a', like_count: 3, comment_count: 2, liked: true }, { recipe_id: 'b', like_count: 0, comment_count: 0, liked: false }]) })
    expect(await f.backend.getRecipeStats([])).toEqual({})
    expect(f.rpcCalls).toHaveLength(0)
    expect(await f.backend.getRecipeStats(['a', 'b'])).toEqual({
      a: { like_count: 3, comment_count: 2, liked: true },
      b: { like_count: 0, comment_count: 0, liked: false },
    })
    expect(f.rpcCalls[0]).toEqual({ name: 'recipe_stats', args: { p_ids: ['a', 'b'] } })
  })

  it('polubienie: już polubione (23505) nie jest błędem; inne błędy tak', async () => {
    await expect(fake({ results: () => ({ data: null, error: { code: '23505', message: 'dup' } }) }).backend.likeRecipe('r')).resolves.toBeUndefined()
    await expect(fake({ results: () => ({ data: null, error: { code: '42501', message: 'x' } }) }).backend.likeRecipe('r')).rejects.toThrow(/uprawnień/)
  })

  it('cofnięcie polubienia usuwa tylko własny wiersz', async () => {
    const f = fake()
    await f.backend.unlikeRecipe('r-1')
    const ops = f.calls[0].ops
    expect(f.calls[0].table).toBe('recipe_likes')
    expect(ops).toContainEqual(['delete', []])
    expect(ops).toContainEqual(['eq', ['recipe_id', 'r-1']])
    expect(ops).toContainEqual(['eq', ['user_id', 'me']])
  })
})

describe('komentarze', () => {
  it('listComments: mapuje autora ze zdjęciem', async () => {
    const f = fake({
      rpc: () => ok([{ id: 'c1', recipe_id: 'r', user_id: 'u', body: 'Super', created_at: '2026-09-19T10:00:00Z', author_username: 'anna', author_full_name: null, author_avatar_url: 'https://x/a.jpg' }]),
    })
    const [c] = await f.backend.listComments('r', 0, 20)
    expect(c).toEqual({
      id: 'c1', recipe_id: 'r', user_id: 'u', body: 'Super', created_at: '2026-09-19T10:00:00Z',
      author: { username: 'anna', full_name: undefined, avatar_url: 'https://x/a.jpg' },
    })
    expect(f.rpcCalls[0]).toEqual({ name: 'list_comments', args: { p_recipe: 'r', p_limit: 20, p_offset: 0 } })
  })

  it('addComment: przycina spacje, waliduje długość, dokleja autora', async () => {
    const f = fake({ results: () => ok({ id: 'c9', recipe_id: 'r', user_id: 'me', body: 'Pycha', created_at: 'now' }) })
    const author = { username: 'ja', full_name: 'Ja Ja', avatar_url: undefined }
    const created = await f.backend.addComment('r', '  Pycha  ', author)
    expect(created).toMatchObject({ id: 'c9', body: 'Pycha', author })
    expect(f.calls[0].ops).toContainEqual(['insert', [{ recipe_id: 'r', body: 'Pycha' }]])

    await expect(f.backend.addComment('r', '   ', author)).rejects.toThrow(/Napisz/)
    await expect(f.backend.addComment('r', 'x'.repeat(501), author)).rejects.toThrow(/500/)
    expect(f.calls).toHaveLength(1) // walidacja nie wysyła zapytań
  })

  it('deleteComment usuwa po id', async () => {
    const f = fake()
    await f.backend.deleteComment({ id: 'c1', recipe_id: 'r', user_id: 'u', body: 'x', created_at: '', author: { username: 'a' } })
    expect(f.calls[0].ops).toContainEqual(['eq', ['id', 'c1']])
  })
})

describe('profile, listy i zdjęcie profilowe', () => {
  const summaryRow = { id: 'u', username: 'anna', full_name: 'Anna', avatar_url: 'https://x/a.jpg', is_public: true, recipe_count: 2, followers_count: 5, following_count: 1, is_following: true, is_me: false }

  it('listFollowers / listFollowing wołają właściwe funkcje z parametrami', async () => {
    const f = fake({ rpc: () => ok([summaryRow]) })
    const [p] = await f.backend.listFollowers('Anna', 30, 10)
    expect(p).toMatchObject({ username: 'anna', avatar_url: 'https://x/a.jpg', followers_count: 5, is_following: true })
    await f.backend.listFollowing('Anna', 0, 30)
    expect(f.rpcCalls).toEqual([
      { name: 'list_followers', args: { p_username: 'anna', p_limit: 10, p_offset: 30 } },
      { name: 'list_following', args: { p_username: 'anna', p_limit: 30, p_offset: 0 } },
    ])
  })

  it('updateProfile przekazuje avatar_url (także null = usunięcie)', async () => {
    const row = { id: 'me', username: 'ja', full_name: null, avatar_url: null, is_public: true }
    const f = fake({ results: () => ok(row) })
    await f.backend.updateProfile({ avatar_url: 'https://x/new.jpg' })
    await f.backend.updateProfile({ avatar_url: null })
    await f.backend.updateProfile({ is_public: false }) // bez avatar_url — nie ruszamy zdjęcia
    expect(f.calls[0].ops).toContainEqual(['update', [{ avatar_url: 'https://x/new.jpg' }]])
    expect(f.calls[1].ops).toContainEqual(['update', [{ avatar_url: null }]])
    expect(f.calls[2].ops).toContainEqual(['update', [{ is_public: false }]])
  })

  it('brak migracji daje czytelny komunikat z nazwami plików', async () => {
    const missing = fake({ rpc: () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.list_followers' } }) })
    await expect(missing.backend.listFollowers('a', 0, 10)).rejects.toThrow(/engagement\.sql/)
  })

  it('błąd zdjęcia profilu (check) i duplikatu nazwy mają osobne komunikaty', async () => {
    const check = fake({ results: () => ({ data: null, error: { code: '23514', message: 'x' } }) })
    await expect(check.backend.updateProfile({ avatar_url: 'zle' })).rejects.toThrow(/zdjęcia|Nazwa/)
    const dup = fake({ results: () => ({ data: null, error: { code: '23505', message: 'x' } }) })
    await expect(dup.backend.updateProfile({ username: 'zajeta' })).rejects.toThrow(/zajęta/)
  })

  it('profileRecipes dokleja autora razem ze zdjęciem', async () => {
    const f = fake({ results: () => ok([{ id: 'r', user_id: 'u', title: 'T', description: null, image_url: null, source_url: null, servings: null, prep_minutes: null, cook_minutes: null, total_minutes: null, ingredients: [], steps: [], tags: [], parse_method: 'manual', created_at: 'a', updated_at: 'b' }]) })
    const [r] = await f.backend.profileRecipes({ id: 'u', username: 'anna', full_name: 'Anna', avatar_url: 'https://x/a.jpg', is_public: true }, 0, 12)
    expect(r.author).toEqual({ username: 'anna', full_name: 'Anna', avatar_url: 'https://x/a.jpg' })
  })
})

describe('tryb bez klienta', () => {
  it('bez Supabase metody zgłaszają czytelny błąd', async () => {
    const b = createSupabaseBackend(() => null)
    await expect(b.getRecipeStats(['a'])).rejects.toThrow(/nie jest skonfigurowany/)
    expect(() => b.subscribeProfileCounts('u', vi.fn())).toThrow(/nie jest skonfigurowany/)
  })
})

describe('powiadomienia', () => {
  const row = { id: 'n1', type: 'comment', created_at: '2026-09-19T10:00:00Z', is_read: false, actor_id: 'u', actor_username: 'anna', actor_full_name: null, actor_avatar_url: 'https://x/a.jpg', recipe_id: 'r', recipe_title: 'Placki', recipe_image_url: null, comment_body: 'Pycha' }

  it('listNotifications mapuje wiersze i przekazuje stronicowanie', async () => {
    const f = fake({ rpc: () => ok([row, { ...row, id: 'n2', type: 'follow', recipe_id: null, recipe_title: null, comment_body: null, is_read: true }]) })
    const [a, b] = await f.backend.listNotifications(20, 10)
    expect(a).toEqual({
      id: 'n1', type: 'comment', created_at: '2026-09-19T10:00:00Z', read: false,
      actor: { username: 'anna', full_name: undefined, avatar_url: 'https://x/a.jpg' },
      recipe: { id: 'r', title: 'Placki', image_url: undefined }, comment_body: 'Pycha',
    })
    expect(b).toMatchObject({ type: 'follow', read: true, recipe: undefined, comment_body: undefined })
    expect(f.rpcCalls[0]).toEqual({ name: 'list_notifications', args: { p_limit: 10, p_offset: 20 } })
  })

  it('licznik i oznaczanie jako przeczytane', async () => {
    const f = fake({ rpc: (name) => ok(name === 'unread_notification_count' ? 4 : null) })
    expect(await f.backend.countUnreadNotifications()).toBe(4)
    await f.backend.markNotificationsRead()
    expect(f.rpcCalls.map((c) => c.name)).toEqual(['unread_notification_count', 'mark_notifications_read'])
  })

  it('nasłuchuje wstawień do notifications tylko dla mnie i kończy nasłuch', () => {
    const f = fake()
    let n = 0
    const stop = f.backend.subscribeNotifications('u-1', () => n++)
    const ch = f.channels[0]
    expect(ch.subscribed).toBe(true)
    expect(ch.listeners[0].filter).toEqual({ event: 'INSERT', schema: 'public', table: 'notifications', filter: 'recipient_id=eq.u-1' })
    ch.listeners[0].cb({ new: { id: 'x' } })
    expect(n).toBe(1)
    stop()
    expect(f.removed).toEqual([ch])
  })

  it('getRecipe: brak wiersza daje null', async () => {
    expect(await fake({ results: () => ok(null) }).backend.getRecipe('x')).toBeNull()
  })

  it('brak migracji wskazuje notifications.sql', async () => {
    const f = fake({ rpc: () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.list_notifications' } }) })
    await expect(f.backend.listNotifications(0, 5)).rejects.toThrow(/notifications\.sql/)
  })
})

describe('ostatni komentarz w statystykach', () => {
  it('getRecipeStats mapuje ostatni komentarz z autorem albo pomija go, gdy brak', async () => {
    const base = { like_count: 1, comment_count: 2, liked: false }
    const f = fake({
      rpc: () =>
        ok([
          { recipe_id: 'a', ...base, last_comment_id: 'c1', last_comment_body: 'Pycha!', last_comment_at: '2026-09-19T10:00:00Z', last_comment_username: 'ola', last_comment_avatar_url: null },
          { recipe_id: 'b', ...base, comment_count: 0, last_comment_id: null, last_comment_body: null, last_comment_at: null, last_comment_username: null, last_comment_avatar_url: null },
        ]),
    })
    const stats = await f.backend.getRecipeStats(['a', 'b'])
    expect(stats.a.last_comment).toEqual({ id: 'c1', body: 'Pycha!', created_at: '2026-09-19T10:00:00Z', author: { username: 'ola', avatar_url: undefined } })
    expect(stats.b.last_comment).toBeUndefined()
  })
})
