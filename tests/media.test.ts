import { describe, expect, it, vi } from 'vitest'

// Bez prawdziwego DNS: każda nazwa hosta „rozwiązuje się” na publiczny adres
vi.mock('node:dns/promises', () => ({ lookup: async () => [{ address: '93.184.216.34', family: 4 }] }))

import { parseRecipeUrl } from '../api/_lib/pipeline'
import { estimateServings } from '../api/_lib/gemini'

const VIDEO = 'https://www.tiktok.com/@kuchnia_zosi/video/7300000000000000001'
const CDN = 'https://p16-common-sign.tiktokcdn-eu.com/tos-useast2a-p-0037-euttp/abc~tplv-tiktokx-origin.image?x-expires=1789934400&x-signature=zzz'

const CAPTION =
  'Placki ziemniaczane 🥔 Składniki: 1 kg ziemniaków, 1 cebula, 2 jajka, 3 łyżki mąki, sól. Przygotowanie: zetrzyj, wymieszaj i smaż po 3 minuty z każdej strony. #placki #obiad'

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

/** Atrapa sieci: oEmbed TikToka, CDN miniaturek, Supabase Storage i dwa rodzaje wywołań Gemini (CDN i Storage nie powinny być wołane) */
function network(r: Routes = {}) {
  const calls: { url: string; init?: RequestInit }[] = []
  const impl = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init })
    if (url.includes('tiktok.com/oembed')) {
      const thumb = r.thumbnail === undefined ? CDN : r.thumbnail
      return new Response(JSON.stringify({ title: CAPTION, author_name: 'Zosia', ...(thumb ? { thumbnail_url: thumb } : {}) }))
    }
    if (url.includes('tiktokcdn')) return r.cdn?.() ?? new Response('obraz', { status: 200, headers: { 'content-type': 'image/jpeg' } })
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

describe('import nie przenosi cudzych zdjęć (prawa autorskie, Apple 5.2.3)', () => {
  it('post z TikToka: miniatura nie jest pobierana, zapisywana ani podlinkowana', async () => {
    const { fetchImpl, calls } = network()
    const out = await parseRecipeUrl(VIDEO, { ...opts, fetchImpl })
    expect(out.draft.title).toBe('Placki ziemniaczane')
    expect(out.draft.image_url).toBeUndefined()
    expect(calls.some((c) => c.url.includes('tiktokcdn') || c.url.includes('/storage/'))).toBe(false)
    expect('thumbnail' in out).toBe(false)
  })

  it('zwykła strona: zdjęcie z JSON-LD i og:image nie trafia do szkicu przepisu', async () => {
    const html = `<html><head><meta property="og:image" content="https://cdn.example/foto.jpg"></head><script type="application/ld+json">${JSON.stringify({ '@type': 'Recipe', name: 'Zupa', image: 'https://cdn.example/foto.jpg', recipeIngredient: ['woda', 'sól'], recipeInstructions: ['gotuj'] })}</script></html>`
    const impl = vi.fn(async () => new Response(html, { headers: { 'content-type': 'text/html' } })) as unknown as typeof fetch
    const out = await parseRecipeUrl('http://8.8.8.8/zupa', { fetchImpl: impl })
    expect(out.draft.title).toBe('Zupa')
    expect(out.draft.image_url).toBeUndefined()
  })

  it('brak przepisu w opisie: nic nie jest pobierane z CDN ani zapisywane', async () => {
    const { fetchImpl, calls } = network({ recipe: { is_recipe: false, title: '', ingredients: [], steps: [] } })
    await expect(parseRecipeUrl(VIDEO, { ...opts, fetchImpl })).rejects.toMatchObject({ code: 'no_recipe_in_caption' })
    expect(calls.some((c) => c.url.includes('/storage/') || c.url.includes('tiktokcdn'))).toBe(false)
  })
})

describe('szacowanie porcji', () => {
  it('gdy źródło nie podaje porcji, AI je szacuje i oznacza jako szacunek', async () => {
    const { fetchImpl } = network({ estimate: () => geminiReply({ servings: 4 }) })
    const out = await parseRecipeUrl(VIDEO, { ...opts, fetchImpl })
    expect(out.draft.servings).toBe(4)
    expect(out.servingsEstimated).toBe(true)
  })

  it('porcje podane w źródle nie są szacowane (bez dodatkowego wywołania)', async () => {
    const { fetchImpl, calls } = network({ recipe: { ...recipe, servings: 6 } })
    const out = await parseRecipeUrl(VIDEO, { ...opts, fetchImpl })
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
      const out = await parseRecipeUrl(VIDEO, { ...opts, fetchImpl })
      expect(out.draft.title).toBe('Placki ziemniaczane')
      expect(out.draft.servings).toBeUndefined()
      expect(out.servingsEstimated).toBe(false)
    }
  })

  it('przepis z jednym składnikiem nie jest szacowany', async () => {
    const { fetchImpl, calls } = network({ recipe: { ...recipe, ingredients: [{ text: 'woda' }] } })
    const out = await parseRecipeUrl(VIDEO, { ...opts, fetchImpl })
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
