import { describe, expect, it, vi } from 'vitest'
import { bearerToken, verifyAccessToken } from '../api/_lib/auth'
import { draftToInsert, rowToRecipe, type RecipeRow } from '../src/lib/supabaseRepository'
import { emptyDraft } from '../src/types/recipe'

const cfg = { url: 'https://abc.supabase.co/', anonKey: 'sb_publishable_x' }

describe('auth (endpoint /api/parse-recipe)', () => {
  it('wyciąga token Bearer', () => {
    expect(bearerToken('Bearer abc.def')).toBe('abc.def')
    expect(bearerToken('bearer abc')).toBe('abc')
    expect(bearerToken('Basic abc')).toBeNull()
    expect(bearerToken(undefined)).toBeNull()
    expect(bearerToken('Bearer')).toBeNull()
  })

  it('akceptuje ważny token i wysyła klucz oraz token do Supabase', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: 'user-1' }), { status: 200 })) as unknown as typeof fetch
    expect(await verifyAccessToken('tok', cfg, fetchImpl)).toEqual({ id: 'user-1' })
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://abc.supabase.co/auth/v1/user')
    expect(init.headers).toMatchObject({ authorization: 'Bearer tok', apikey: 'sb_publishable_x' })
  })

  it('odrzuca nieprawidłowy/wygasły token', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 401 })) as unknown as typeof fetch
    expect(await verifyAccessToken('bad', cfg, fetchImpl)).toBeNull()
  })

  it('awaria Supabase to wyjątek, nie „niezalogowany”', async () => {
    const fetchImpl = vi.fn(async () => new Response('oops', { status: 500 })) as unknown as typeof fetch
    await expect(verifyAccessToken('tok', cfg, fetchImpl)).rejects.toThrow(/500/)
  })
})

describe('mapowanie wiersz ↔ Recipe', () => {
  const row: RecipeRow = {
    id: 'id-1',
    title: 'Placki',
    description: null,
    image_url: null,
    source_url: 'https://x.pl/p',
    servings: 4,
    prep_minutes: null,
    cook_minutes: 20,
    total_minutes: 20,
    ingredients: [{ text: '1 kg ziemniaków' }],
    steps: [{ text: 'Zetrzyj.', group: 'Ciasto' }],
    tags: ['obiad'],
    parse_method: 'json-ld',
    created_at: '2026-09-18T10:00:00Z',
    updated_at: '2026-09-18T10:00:00Z',
  }

  it('null z bazy → undefined w aplikacji', () => {
    const r = rowToRecipe(row)
    expect(r.description).toBeUndefined()
    expect(r.prep_minutes).toBeUndefined()
    expect(r.servings).toBe(4)
    expect(r.steps[0].group).toBe('Ciasto')
  })

  it('draft → insert: undefined → null, bez pól nadawanych przez bazę', () => {
    const insert = draftToInsert({ ...emptyDraft(), title: 'X', servings: 2 })
    expect(insert.description).toBeNull()
    expect(insert.servings).toBe(2)
    expect(insert).not.toHaveProperty('id')
    expect(insert).not.toHaveProperty('user_id')
    expect(insert).not.toHaveProperty('created_at')
  })
})
