import { describe, expect, it, vi } from 'vitest'
import jpeg from 'jpeg-js'

// Bez prawdziwego DNS: każda nazwa hosta „rozwiązuje się” na publiczny adres
vi.mock('node:dns/promises', () => ({ lookup: async () => [{ address: '93.184.216.34', family: 4 }] }))

import {
  COVER_MAX_WIDTH,
  cropToCover,
  downloadTikTokThumbnail,
  prepareCover,
  sniffImageType,
  uploadRecipeImage,
  type StorageConfig,
} from '../api/_lib/image'
import { parseRecipeUrl } from '../api/_lib/pipeline'
import { estimateServings } from '../api/_lib/gemini'

const VIDEO = 'https://www.tiktok.com/@kuchnia_zosi/video/7300000000000000001'
const CDN = 'https://p16-common-sign.tiktokcdn-eu.com/tos-useast2a-p-0037-euttp/abc~tplv-tiktokx-origin.image?x-expires=1789934400&x-signature=zzz'

/** Prawdziwy JPEG z trzema poziomymi pasami: czerwony (góra), zielony (środek), niebieski (dół) */
function makeJpeg(width: number, height: number): Uint8Array {
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    const third = y < height / 3 ? [255, 0, 0] : y < (2 * height) / 3 ? [0, 255, 0] : [0, 0, 255]
    for (let x = 0; x < width; x++) data.set([...third, 255], (y * width + x) * 4)
  }
  return new Uint8Array(jpeg.encode({ data, width, height }, 90).data)
}
const decode = (b: Uint8Array) => jpeg.decode(b, { useTArray: true, formatAsRGBA: true })
const pixel = (img: ReturnType<typeof decode>, x: number, y: number) => Array.from(img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 3))
const PORTRAIT = makeJpeg(108, 192) // proporcje 9:16 jak miniatura TikToka

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
    if (url.includes('tiktokcdn')) return r.cdn?.() ?? new Response(PORTRAIT as unknown as BodyInit, { status: 200, headers: { 'content-type': 'image/jpeg' } })
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

describe('kadrowanie okładki (4:3, jak zdjęcia ze stron)', () => {
  it('pionowy kadr 9:16 → poziomy 4:3, bierzemy środek obrazu', () => {
    const out = decode(cropToCover(PORTRAIT))
    expect(out.width).toBe(108)
    expect(out.height).toBe(81) // 108 / (4/3)
    expect(out.width / out.height).toBeCloseTo(4 / 3, 1)
    // środek to zielony pas; czerwony (góra) i niebieski (dół) prawie wypadają z kadru
    const [r, g, b] = pixel(out, 54, 40)
    expect(g).toBeGreaterThan(200)
    expect(r).toBeLessThan(60)
    expect(b).toBeLessThan(60)
  })

  it('avoidCenter (podgląd wideo z przyciskiem play na środku): pionowy obraz → górny pas zamiast środka', () => {
    const out = decode(cropToCover(PORTRAIT, { avoidCenter: true }))
    expect(out.width).toBe(108)
    expect(out.height).toBe(81)
    // górny pas 42% wysokości: czerwony, bez zielonego środka
    const [r, g, b] = pixel(out, 54, 40)
    expect(r).toBeGreaterThan(200)
    expect(g).toBeLessThan(60)
    expect(b).toBeLessThan(60)
    // kadr obejmuje górne 81 z 192 px (42%), więc środek obrazu (50%), gdzie leży przycisk play, nie trafia na okładkę
    expect(out.height).toBeLessThan(192 / 2)
    // obraz poziomy bez przycinania zostaje bajt w bajt także z avoidCenter
    const wide = makeJpeg(400, 300)
    expect(cropToCover(wide, { avoidCenter: true })).toBe(wide)
  })

  it('duży obraz jest zmniejszany do COVER_MAX_WIDTH z zachowaniem 4:3', () => {
    const out = decode(cropToCover(makeJpeg(1080, 1920)))
    expect(out.width).toBe(COVER_MAX_WIDTH)
    expect(out.height).toBe(600)
    expect(out.width / out.height).toBeCloseTo(4 / 3, 2)
  })

  it('obraz poziomy i nieduży zostaje bez zmian (bajt w bajt)', () => {
    const wide = makeJpeg(400, 200)
    expect(cropToCover(wide)).toBe(wide)
    const fourThree = makeJpeg(400, 300)
    expect(cropToCover(fourThree)).toBe(fourThree)
  })

  it('prepareCover: uszkodzony JPEG zostaje w oryginale, inne formaty bez zmian', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const broken = { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]), contentType: 'image/jpeg' }
    expect(prepareCover(broken)).toBe(broken)
    const png = { bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0]), contentType: 'image/png' }
    expect(prepareCover(png)).toBe(png)
  })
})

describe('obrazy: pobieranie i zapis', () => {
  it('sniffImageType rozpoznaje po bajtach, nie po nagłówku', () => {
    expect(sniffImageType(PORTRAIT)).toBe('image/jpeg')
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0]))).toBe('image/png')
    expect(sniffImageType(new TextEncoder().encode('<html>udaję obraz</html>'))).toBeNull()
    expect(sniffImageType(new TextEncoder().encode('....ftypheic....'))).toBeNull()
  })

  it('pobiera miniaturkę z CDN TikToka i przesyła nagłówki przeglądarkowe', async () => {
    const { fetchImpl, calls } = network()
    const { image } = await downloadTikTokThumbnail(CDN, fetchImpl)
    expect(image?.contentType).toBe('image/jpeg')
    expect(image?.bytes.length).toBe(PORTRAIT.length)
    expect(calls[0].init?.headers).toMatchObject({ referer: 'https://www.tiktok.com/' })
  })

  it('odrzuca adresy spoza CDN z czytelnym powodem', async () => {
    const { fetchImpl } = network()
    for (const bad of [
      'https://evil.example/x.jpg',
      'https://tiktokcdn-eu.com.evil.example/x.jpg',
      'http://p16-common-sign.tiktokcdn-eu.com/x.jpg', // bez https
    ]) {
      const r = await downloadTikTokThumbnail(bad, fetchImpl)
      expect(r.image, bad).toBeUndefined()
      expect(r.reason, bad).toMatch(/poza CDN/)
    }
    expect((await downloadTikTokThumbnail('nie url', fetchImpl)).reason).toMatch(/nieprawidłowy/)
  })

  it('podaje kod HTTP, gdy CDN odmawia (np. 403 z regionu serwera)', async () => {
    const { fetchImpl } = network({ cdn: () => new Response('denied', { status: 403 }) })
    expect((await downloadTikTokThumbnail(CDN, fetchImpl)).reason).toBe('pobranie miniaturki: HTTP 403')
  })

  it('idzie za przekierowaniem w obrębie CDN, ale nie poza niego', async () => {
    let n = 0
    const follow = vi.fn(async () =>
      n++ === 0
        ? new Response(null, { status: 302, headers: { location: 'https://p19-sign.tiktokcdn-us.com/other.image' } })
        : new Response(PORTRAIT as unknown as BodyInit, { status: 200 }),
    ) as unknown as typeof fetch
    expect((await downloadTikTokThumbnail(CDN, follow)).image?.contentType).toBe('image/jpeg')

    const escape = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } })) as unknown as typeof fetch
    expect((await downloadTikTokThumbnail(CDN, escape)).reason).toMatch(/poza CDN/)

    const loop = vi.fn(async () => new Response(null, { status: 302, headers: { location: CDN } })) as unknown as typeof fetch
    expect((await downloadTikTokThumbnail(CDN, loop)).reason).toMatch(/przekierowań/)
  })

  it('HTML podszywający się pod obraz i błędy sieci', async () => {
    const html = vi.fn(async () => new Response('<html>nie obraz</html>', { headers: { 'content-type': 'image/jpeg' } })) as unknown as typeof fetch
    expect((await downloadTikTokThumbnail(CDN, html)).reason).toMatch(/formacie/)
    const boom = vi.fn(async () => { throw new Error('sieć') }) as unknown as typeof fetch
    expect((await downloadTikTokThumbnail(CDN, boom)).reason).toMatch(/sieć/)
    const big = vi.fn(async () => new Response(new Uint8Array(2_000_000), { status: 200 })) as unknown as typeof fetch
    expect((await downloadTikTokThumbnail(CDN, big)).reason).toMatch(/duża/)
  })

  it('zapis do Storage: token użytkownika, folder użytkownika, publiczny adres', async () => {
    const { fetchImpl, calls } = network()
    const url = await uploadRecipeImage({ bytes: PORTRAIT, contentType: 'image/jpeg' }, storage, fetchImpl)
    expect(url).toMatch(/^https:\/\/abc\.supabase\.co\/storage\/v1\/object\/public\/recipe-images\/user-123\/[0-9a-f-]{36}\.jpg$/)
    const call = calls[0]
    expect(call.url).toMatch(/^https:\/\/abc\.supabase\.co\/storage\/v1\/object\/recipe-images\/user-123\/.+\.jpg$/)
    expect(call.init?.method).toBe('POST')
    expect(call.init?.headers).toMatchObject({ authorization: 'Bearer user.jwt.token', apikey: 'sb_publishable_x', 'content-type': 'image/jpeg' })
  })

  it('błąd Storage (np. brak bucketa) to wyjątek', async () => {
    const { fetchImpl } = network({ storage: () => new Response('{"error":"Bucket not found"}', { status: 400 }) })
    await expect(uploadRecipeImage({ bytes: PORTRAIT, contentType: 'image/jpeg' }, storage, fetchImpl)).rejects.toThrow(/400/)
  })
})

describe('zdjęcie przepisu z TikToka', () => {
  it('zapisuje w Storage przycięty kadr 4:3 i zwraca trwały adres (nie podpisany adres TikToka)', async () => {
    const { fetchImpl, calls } = network()
    const out = await parseRecipeUrl(VIDEO, { ...opts, fetchImpl, storage })
    expect(out.draft.image_url).toContain('/storage/v1/object/public/recipe-images/user-123/')
    expect(out.draft.image_url).not.toContain('tiktokcdn')
    expect(out.thumbnail).toEqual({ status: 'saved' })

    const upload = calls.find((c) => c.url.includes('/storage/v1/object/'))!
    const saved = decode(new Uint8Array(await (upload.init!.body as Blob).arrayBuffer()))
    expect(saved.width / saved.height).toBeCloseTo(4 / 3, 1) // taki sam kadr jak okładki ze stron
  })

  it('awaria Storage: przepis zostaje, bez zdjęcia, z powodem', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { fetchImpl } = network({ storage: () => new Response('new row violates row-level security policy', { status: 403 }) })
    const out = await parseRecipeUrl(VIDEO, { ...opts, fetchImpl, storage })
    expect(out.draft.title).toBe('Placki ziemniaczane')
    expect(out.draft.image_url).toBeUndefined()
    expect(out.thumbnail.status).toBe('failed')
    expect(out.thumbnail.reason).toMatch(/zapis w Storage: Storage HTTP 403/)
  })

  it('CDN odmawia: status failed z kodem HTTP', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { fetchImpl } = network({ cdn: () => new Response('nope', { status: 403 }) })
    const out = await parseRecipeUrl(VIDEO, { ...opts, fetchImpl, storage })
    expect(out.thumbnail).toEqual({ status: 'failed', reason: 'pobranie miniaturki: HTTP 403' })
    expect(out.draft.image_url).toBeUndefined()
  })

  it('miniaturka spoza CDN TikToka nie jest pobierana', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { fetchImpl, calls } = network({ thumbnail: 'https://evil.example/x.jpg' })
    const out = await parseRecipeUrl(VIDEO, { ...opts, fetchImpl, storage })
    expect(out.thumbnail.status).toBe('failed')
    expect(calls.some((c) => c.url.includes('evil.example'))).toBe(false)
  })

  it('tryb lokalny (bez Supabase): adres tymczasowy z TikToka', async () => {
    const { fetchImpl, calls } = network()
    const out = await parseRecipeUrl(VIDEO, { ...opts, fetchImpl })
    expect(out.draft.image_url).toBe(CDN)
    expect(out.thumbnail.status).toBe('temporary')
    expect(calls.some((c) => c.url.includes('/storage/'))).toBe(false)
  })

  it('film bez miniaturki: status none', async () => {
    const { fetchImpl } = network({ thumbnail: null })
    const out = await parseRecipeUrl(VIDEO, { ...opts, fetchImpl, storage })
    expect(out.draft.image_url).toBeUndefined()
    expect(out.thumbnail).toEqual({ status: 'none' })
  })

  it('zwykła strona: thumbnail none, obraz z og:image nie jest ruszany', async () => {
    const html = `<html><head><meta property="og:image" content="https://cdn.example/foto.jpg"></head><script type="application/ld+json">${JSON.stringify({ '@type': 'Recipe', name: 'Zupa', image: 'https://cdn.example/foto.jpg', recipeIngredient: ['woda', 'sól'], recipeInstructions: ['gotuj'], recipeYield: '2' })}</script></html>`
    const impl = vi.fn(async () => new Response(html, { headers: { 'content-type': 'text/html' } })) as unknown as typeof fetch
    const out = await parseRecipeUrl('http://8.8.8.8/zupa', { fetchImpl: impl })
    expect(out.thumbnail).toEqual({ status: 'none' })
    expect(out.draft.image_url).toBe('https://cdn.example/foto.jpg')
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
