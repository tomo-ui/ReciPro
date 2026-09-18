import { describe, expect, it, vi } from 'vitest'

// Bez prawdziwego DNS: każda nazwa hosta „rozwiązuje się” na publiczny adres
vi.mock('node:dns/promises', () => ({ lookup: async () => [{ address: '93.184.216.34', family: 4 }] }))

import { downloadTikTokThumbnail, sniffImageType, uploadRecipeImage, type StorageConfig } from '../api/_lib/image'
import { parseRecipeUrl } from '../api/_lib/pipeline'
import { estimateServings } from '../api/_lib/gemini'

const VIDEO = 'https://www.tiktok.com/@kuchnia_zosi/video/7300000000000000001'
const CDN = 'https://p16-common-sign.tiktokcdn-eu.com/tos-useast2a-p-0037-euttp/abc~tplv-tiktokx-origin.image?x-expires=1789934400&x-signature=zzz'

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 1, 2, 3, 4, 5, 6])
const CAPTION =
  'Placki ziemniaczane 🥔 Składniki: 1 kg ziemniaków, 1 cebula, 2 jajka, 3 łyżki mąki, sól. Przygotowanie: zetrzyj, wymieszaj i smaż po 3 minuty z każdej strony. #placki #obiad'

const storage: StorageConfig = {
  supabaseUrl: 'https://abc.supabase.co/',
  anonKey: 'sb_publishable_x',
  userToken: 'user.jwt.token',
  userId: 'user-123',
}

const geminiReply = (payload: unknown) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }), { status: 200 })

const recipe = {
  is_recipe: true,
  title: 'Placki ziemniaczane',
  ingredients: [{ text: '1 kg ziemniaków' }, { text: '1 cebula' }, { text: '2 jajka' }],
  steps: [{ text: 'Zetrzyj ziemniaki.' }, { text: 'Smaż.' }],
}

interface Routes {
  thumbnail?: string | null // adres z oEmbed (null = brak pola)
  cdn?: () => Response
  storage?: () => Response
  recipe?: Record<string, unknown>
  estimate?: () => Response
}

/** Atrapa sieci: oEmbed TikToka, CDN miniaturek, Supabase Storage i dwa rodzaje wywołań Gemini */
function network(r: Routes = {}) {
  const calls: { url: string; init?: RequestInit }[] = []
  const impl = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init })
    if (url.includes('tiktok.com/oembed')) {
      const thumb = r.thumbnail === undefined ? CDN : r.thumbnail
      return new Response(JSON.stringify({ title: CAPTION, author_name: 'Zosia', ...(thumb ? { thumbnail_url: thumb } : {}) }))
    }
    if (url.includes('tiktokcdn')) return r.cdn?.() ?? new Response(JPEG, { status: 200, headers: { 'content-type': 'image/jpeg' } })
    if (url.includes('/storage/v1/object/')) return r.storage?.() ?? new Response('{}', { status: 200 })
    if (url.includes('generativelanguage')) {
      const body = String(init?.body ?? '')
      return body.includes('estimate how many portions') ? (r.estimate?.() ?? geminiReply({ servings: 0 })) : geminiReply(r.recipe ?? recipe)
    }
    return new Response('<html></html>', { headers: { 'content-type': 'text/html' } })
  })
  return { fetchImpl: impl as unknown as typeof fetch, calls }
}

const opts = { geminiApiKey: 'K', geminiRetryDelayMs: 0 }
const geminiCalls = (c: { url: string }[]) => c.filter((x) => x.url.includes('generativelanguage')).length

describe('obrazy', () => {
  it('sniffImageType rozpoznaje po bajtach, nie po nagłówku', () => {
    expect(sniffImageType(JPEG)).toBe('image/jpeg')
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0]))).toBe('image/png')
    expect(sniffImageType(new TextEncoder().encode('<html>udaję obraz</html>'))).toBeNull()
    expect(sniffImageType(new TextEncoder().encode('....ftypheic....'))).toBeNull()
  })

  it('pobiera miniaturkę tylko z CDN TikToka', async () => {
    const { fetchImpl } = network()
    const img = await downloadTikTokThumbnail(CDN, fetchImpl)
    expect(img?.contentType).toBe('image/jpeg')
    expect(img?.bytes.length).toBe(JPEG.length)

    for (const bad of [
      'https://evil.example/x.jpg',
      'https://tiktokcdn-eu.com.evil.example/x.jpg',
      'http://p16-common-sign.tiktokcdn-eu.com/x.jpg', // bez https
      'nie url',
    ]) {
      expect(await downloadTikTokThumbnail(bad, fetchImpl), bad).toBeNull()
    }
  })

  it('odrzuca HTML podszywający się pod obraz, przekierowania i błędy', async () => {
    const html = vi.fn(async () => new Response('<html>nie obraz</html>', { headers: { 'content-type': 'image/jpeg' } })) as unknown as typeof fetch
    expect(await downloadTikTokThumbnail(CDN, html)).toBeNull()
    const redirect = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } })) as unknown as typeof fetch
    expect(await downloadTikTokThumbnail(CDN, redirect)).toBeNull()
    const boom = vi.fn(async () => { throw new Error('sieć') }) as unknown as typeof fetch
    expect(await downloadTikTokThumbnail(CDN, boom)).toBeNull()
  })

  it('zapis do Storage: token użytkownika, folder użytkownika, publiczny adres', async () => {
    const { fetchImpl, calls } = network()
    const url = await uploadRecipeImage({ bytes: JPEG, contentType: 'image/jpeg' }, storage, fetchImpl)
    expect(url).toMatch(/^https:\/\/abc\.supabase\.co\/storage\/v1\/object\/public\/recipe-images\/user-123\/[0-9a-f-]{36}\.jpg$/)
    const call = calls[0]
    expect(call.url).toMatch(/^https:\/\/abc\.supabase\.co\/storage\/v1\/object\/recipe-images\/user-123\/.+\.jpg$/)
    expect(call.init?.method).toBe('POST')
    expect(call.init?.headers).toMatchObject({ authorization: 'Bearer user.jwt.token', apikey: 'sb_publishable_x', 'content-type': 'image/jpeg' })
  })

  it('błąd Storage (np. brak bucketa) to wyjątek', async () => {
    const { fetchImpl } = network({ storage: () => new Response('{"error":"Bucket not found"}', { status: 400 }) })
    await expect(uploadRecipeImage({ bytes: JPEG, contentType: 'image/jpeg' }, storage, fetchImpl)).rejects.toThrow(/400/)
  })
})

describe('zdjęcie przepisu z TikToka', () => {
  it('zapisuje miniaturkę w Storage i zwraca trwały adres (nie podpisany adres TikToka)', async () => {
    const { fetchImpl } = network()
    const out = await parseRecipeUrl(VIDEO, { ...opts, fetchImpl, storage })
    expect(out.draft.image_url).toContain('/storage/v1/object/public/recipe-images/user-123/')
    expect(out.draft.image_url).not.toContain('tiktokcdn')
    expect(out.thumbnailFailed).toBe(false)
  })

  it('awaria Storage: przepis zostaje, bez zdjęcia, z flagą', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { fetchImpl } = network({ storage: () => new Response('nope', { status: 403 }) })
    const out = await parseRecipeUrl(VIDEO, { ...opts, fetchImpl, storage })
    expect(out.draft.title).toBe('Placki ziemniaczane')
    expect(out.draft.image_url).toBeUndefined()
    expect(out.thumbnailFailed).toBe(true)
  })

  it('miniaturka spoza CDN TikToka nie jest pobierana', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { fetchImpl, calls } = network({ thumbnail: 'https://evil.example/x.jpg' })
    const out = await parseRecipeUrl(VIDEO, { ...opts, fetchImpl, storage })
    expect(out.thumbnailFailed).toBe(true)
    expect(calls.some((c) => c.url.includes('evil.example'))).toBe(false)
  })

  it('tryb lokalny (bez Supabase): adres tymczasowy z TikToka', async () => {
    const { fetchImpl, calls } = network()
    const out = await parseRecipeUrl(VIDEO, { ...opts, fetchImpl })
    expect(out.draft.image_url).toBe(CDN)
    expect(calls.some((c) => c.url.includes('/storage/'))).toBe(false)
  })

  it('film bez miniaturki: brak zdjęcia i brak flagi błędu', async () => {
    const { fetchImpl } = network({ thumbnail: null })
    const out = await parseRecipeUrl(VIDEO, { ...opts, fetchImpl, storage })
    expect(out.draft.image_url).toBeUndefined()
    expect(out.thumbnailFailed).toBe(false)
  })

  it('brak przepisu w opisie: nic nie ląduje w Storage', async () => {
    const { fetchImpl, calls } = network({ recipe: { is_recipe: false, title: '', ingredients: [], steps: [] } })
    await expect(parseRecipeUrl(VIDEO, { ...opts, fetchImpl, storage })).rejects.toMatchObject({ code: 'no_recipe_in_caption' })
    expect(calls.some((c) => c.url.includes('/storage/') || c.url.includes('tiktokcdn'))).toBe(false)
  })
})

describe('szacowanie porcji', () => {
  it('gdy źródło nie podaje porcji, AI je szacuje i oznacza jako szacunek', async () => {
    const { fetchImpl } = network({ estimate: () => geminiReply({ servings: 4 }) })
    const out = await parseRecipeUrl(VIDEO, { ...opts, fetchImpl, storage })
    expect(out.draft.servings).toBe(4)
    expect(out.servingsEstimated).toBe(true)
  })

  it('porcje podane w źródle nie są szacowane (bez dodatkowego wywołania)', async () => {
    const { fetchImpl, calls } = network({ recipe: { ...recipe, servings: 6 } })
    const out = await parseRecipeUrl(VIDEO, { ...opts, fetchImpl, storage })
    expect(out.draft.servings).toBe(6)
    expect(out.servingsEstimated).toBe(false)
    expect(geminiCalls(calls)).toBe(1)
  })

  it('model nie potrafi ocenić (0), zwraca głupoty albo pada: porcje zostają puste, import działa', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (const estimate of [
      () => geminiReply({ servings: 0 }),
      () => geminiReply({ servings: 500 }),
      () => geminiReply({ servings: 2.5 }),
      () => geminiReply({}),
      () => new Response('boom', { status: 500 }),
    ]) {
      const { fetchImpl } = network({ estimate })
      const out = await parseRecipeUrl(VIDEO, { ...opts, fetchImpl, storage })
      expect(out.draft.title).toBe('Placki ziemniaczane')
      expect(out.draft.servings).toBeUndefined()
      expect(out.servingsEstimated).toBe(false)
    }
  })

  it('przepis z jednym składnikiem nie jest szacowany', async () => {
    const { fetchImpl, calls } = network({ recipe: { ...recipe, ingredients: [{ text: 'woda' }] } })
    const out = await parseRecipeUrl(VIDEO, { ...opts, fetchImpl, storage })
    expect(out.servingsEstimated).toBe(false)
    expect(geminiCalls(calls)).toBe(1)
  })

  it('działa też dla zwykłych stron (JSON-LD bez recipeYield)', async () => {
    const html = `<script type="application/ld+json">${JSON.stringify({ '@type': 'Recipe', name: 'Zupa', recipeIngredient: ['woda', 'marchew', 'sól'], recipeInstructions: ['gotuj'] })}</script>`
    const impl = vi.fn(async (input: string | URL) =>
      String(input).includes('generativelanguage') ? geminiReply({ servings: 3 }) : new Response(html, { headers: { 'content-type': 'text/html' } }),
    ) as unknown as typeof fetch
    const out = await parseRecipeUrl('http://8.8.8.8/zupa', { ...opts, fetchImpl: impl })
    expect(out.origin).toBe('page')
    expect(out.draft.parse_method).toBe('json-ld')
    expect(out.draft.servings).toBe(3)
    expect(out.servingsEstimated).toBe(true)
  })

  it('bez klucza Gemini szacowanie jest pomijane', async () => {
    const html = `<script type="application/ld+json">${JSON.stringify({ '@type': 'Recipe', name: 'Zupa', recipeIngredient: ['woda', 'sól'], recipeInstructions: ['gotuj'] })}</script>`
    const impl = vi.fn(async () => new Response(html, { headers: { 'content-type': 'text/html' } })) as unknown as typeof fetch
    const out = await parseRecipeUrl('http://8.8.8.8/zupa', { fetchImpl: impl })
    expect(out.draft.servings).toBeUndefined()
    expect(out.servingsEstimated).toBe(false)
  })

  it('estimateServings przekazuje danie i składniki, akceptuje tylko 1–24', async () => {
    const { fetchImpl, calls } = network({ estimate: () => geminiReply({ servings: 8 }) })
    expect(await estimateServings({ title: 'Sernik', ingredients: [{ text: '1 kg sera' }, { text: '6 jaj' }] }, { apiKey: 'K', fetchImpl, retryDelayMs: 0 })).toBe(8)
    const sent = String(calls[0].init?.body)
    expect(sent).toContain('Dish: Sernik')
    expect(sent).toContain('- 1 kg sera')
  })
})
