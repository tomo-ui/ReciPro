import { describe, expect, it, vi } from 'vitest'

// Bez prawdziwego DNS: każda nazwa hosta „rozwiązuje się” na publiczny adres
vi.mock('node:dns/promises', () => ({ lookup: async () => [{ address: '93.184.216.34', family: 4 }] }))

import {
  captionFromPageHtml,
  fetchTikTokInfo,
  hashtagsFromCaption,
  isTikTokUrl,
  resolveTikTokUrl,
} from '../api/_lib/tiktok'
import { ParseError, parseRecipeUrl, parseTikTokCaption } from '../api/_lib/pipeline'

const VIDEO = 'https://www.tiktok.com/@kuchnia_zosi/video/7300000000000000001'

const CAPTION = `Chrupiące placki ziemniaczane 🥔😍
Składniki:
🥔 1 kg ziemniaków
🧅 1 cebula
🥚 2 jajka
3 łyżki mąki, sól
Przygotowanie: zetrzyj ziemniaki i cebulę, odlej sok, dodaj jajka, mąkę i sól. Smaż na złoto po 3 minuty z każdej strony.
#placki #obiad #fyp #foryou #przepis #tanie`

const pageWith = (desc: string) =>
  `<html><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify({
    __DEFAULT_SCOPE__: { 'webapp.video-detail': { itemInfo: { itemStruct: { desc, author: { uniqueId: 'kuchnia_zosi' } } } } },
  })}</script></html>`

const geminiOk = (payload: unknown) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }), { status: 200 })

const recipePayload = {
  is_recipe: true,
  title: 'Placki ziemniaczane',
  ingredients: [{ text: '1 kg ziemniaków' }, { text: '1 cebula' }, { text: '2 jajka' }],
  steps: [{ text: 'Zetrzyj ziemniaki i cebulę.' }, { text: 'Smaż na złoto.' }],
  tags: ['Obiad'],
}

/** Router atrapy fetch: oEmbed TikToka / Gemini / cokolwiek innego */
function router(handlers: { oembed?: () => Response; gemini?: () => Response; page?: () => Response }) {
  return vi.fn(async (input: string | URL) => {
    const url = String(input)
    if (url.includes('tiktok.com/oembed')) return handlers.oembed?.() ?? new Response('{}', { status: 400 })
    if (url.includes('generativelanguage')) return handlers.gemini?.() ?? new Response('no', { status: 500 })
    return handlers.page?.() ?? new Response('<html></html>', { headers: { 'content-type': 'text/html' } })
  }) as unknown as typeof fetch
}

describe('rozpoznawanie linków', () => {
  it('isTikTokUrl', () => {
    expect(isTikTokUrl('https://www.tiktok.com/@a/video/1')).toBe(true)
    expect(isTikTokUrl('https://vm.tiktok.com/ZMabc/')).toBe(true)
    expect(isTikTokUrl('https://tiktok.com/t/ZTabc/')).toBe(true)
    expect(isTikTokUrl('https://nottiktok.com/@a/video/1')).toBe(false)
    expect(isTikTokUrl('https://tiktok.com.evil.pl/@a/video/1')).toBe(false)
    expect(isTikTokUrl('ftp://www.tiktok.com/x')).toBe(false)
    expect(isTikTokUrl('nie url')).toBe(false)
  })

  it('kanoniczny adres traci parametry śledzące', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    expect(await resolveTikTokUrl(`${VIDEO}?is_from_webapp=1&sender_device=pc`, fetchImpl)).toBe(VIDEO)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rozwiązuje skrócony link przez przekierowanie', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 301, headers: { location: `${VIDEO}?_r=1` } })) as unknown as typeof fetch
    expect(await resolveTikTokUrl('https://vm.tiktok.com/ZMabc/', fetchImpl)).toBe(VIDEO)
  })

  it('odrzuca przekierowanie poza tiktok.com', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'https://evil.example/x' } })) as unknown as typeof fetch
    await expect(resolveTikTokUrl('https://vm.tiktok.com/ZMabc/', fetchImpl)).rejects.toMatchObject({ code: 'blocked' })
  })

  it('odrzuca link TikToka, który nie jest filmem', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html></html>', { status: 200 })) as unknown as typeof fetch
    await expect(resolveTikTokUrl('https://www.tiktok.com/@user', fetchImpl)).rejects.toMatchObject({ code: 'invalid_url' })
  })
})

describe('pobieranie opisu', () => {
  it('oEmbed: opis i autor', async () => {
    const fetchImpl = router({ oembed: () => new Response(JSON.stringify({ title: CAPTION, author_name: 'Kuchnia Zosi' })) })
    const info = await fetchTikTokInfo(VIDEO, fetchImpl)
    expect(info.caption).toBe(CAPTION)
    expect(info.author).toBe('Kuchnia Zosi')
    expect(info.canonicalUrl).toBe(VIDEO)
  })

  it('gdy oEmbed zawiedzie, czyta opis z danych osadzonych w stronie', async () => {
    const fetchImpl = router({
      oembed: () => new Response('{}', { status: 400 }),
      page: () => new Response(pageWith('Opis z osadzonych danych #x'), { headers: { 'content-type': 'text/html' } }),
    })
    const info = await fetchTikTokInfo(VIDEO, fetchImpl)
    expect(info.caption).toBe('Opis z osadzonych danych #x')
    expect(info.author).toBe('kuchnia_zosi')
  })

  it('brak opisu wszędzie → czytelny błąd', async () => {
    const fetchImpl = router({ oembed: () => new Response('{}', { status: 400 }) })
    await expect(fetchTikTokInfo(VIDEO, fetchImpl)).rejects.toThrow(/opisu filmu/)
  })

  it('captionFromPageHtml toleruje brak / uszkodzenie danych', () => {
    expect(captionFromPageHtml('<html></html>')).toBeNull()
    expect(captionFromPageHtml('<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">{nie json</script>')).toBeNull()
  })
})

describe('hasztagi → tagi', () => {
  it('pomija ogólne (#fyp, #przepis), zostawia opisowe', () => {
    expect(hashtagsFromCaption(CAPTION)).toEqual(['placki', 'obiad', 'tanie'])
    expect(hashtagsFromCaption('Ćwiczenie #żurek i #kuchniapolska #ab')).toEqual(['żurek', 'kuchniapolska'])
  })
})

describe('przepis z opisu filmu', () => {
  const oembed = () => new Response(JSON.stringify({ title: CAPTION, author_name: 'Kuchnia Zosi' }))

  it('zwraca przepis, źródłem jest TikTok, tagi z hasztagów', async () => {
    const fetchImpl = router({ oembed, gemini: () => geminiOk(recipePayload) })
    const d = await parseTikTokCaption(VIDEO, { geminiApiKey: 'K', fetchImpl, geminiRetryDelayMs: 0 })
    expect(d.title).toBe('Placki ziemniaczane')
    expect(d.ingredients).toHaveLength(3)
    expect(d.steps).toHaveLength(2)
    expect(d.source_url).toBe(VIDEO)
    expect(d.parse_method).toBe('gemini')
    expect(d.tags).toEqual(['placki', 'obiad', 'tanie'])
  })

  it('do Gemini trafia sam opis (z autorem), nie strona TikToka', async () => {
    const fetchImpl = router({ oembed, gemini: () => geminiOk(recipePayload) })
    await parseTikTokCaption(VIDEO, { geminiApiKey: 'K', fetchImpl, geminiRetryDelayMs: 0 })
    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.find((c) => String(c[0]).includes('generativelanguage'))!
    const sent = JSON.parse((call[1] as RequestInit).body as string)
    const text = sent.contents[0].parts[0].text as string
    expect(text).toContain('Video caption:')
    expect(text).toContain('@Kuchnia Zosi')
    expect(text).toContain('1 kg ziemniaków')
  })

  it('ogólne tagi zwrócone przez model też są odrzucane', async () => {
    const fetchImpl = router({ oembed, gemini: () => geminiOk({ ...recipePayload, tags: ['fyp', 'Recipe', 'Obiad', 'fypシ'] }) })
    const d = await parseTikTokCaption(VIDEO, { geminiApiKey: 'K', fetchImpl, geminiRetryDelayMs: 0 })
    expect(d.tags).toEqual(['placki', 'obiad', 'tanie'])
  })

  it('opis bez przepisu („w komentarzu”) → no_recipe_in_caption', async () => {
    const chatty = 'Najlepszy obiad tygodnia, przepis w komentarzu pod filmem! Zapisz i zrób w weekend 😍 #obiad'
    const fetchImpl = router({
      oembed: () => new Response(JSON.stringify({ title: chatty })),
      gemini: () => geminiOk({ is_recipe: false, title: '', ingredients: [], steps: [] }),
    })
    const err = await parseTikTokCaption(VIDEO, { geminiApiKey: 'K', fetchImpl, geminiRetryDelayMs: 0 }).catch((e) => e)
    expect(err).toBeInstanceOf(ParseError)
    expect(err.code).toBe('no_recipe_in_caption')
  })

  it('bardzo krótki opis nie wywołuje Gemini', async () => {
    const fetchImpl = router({ oembed: () => new Response(JSON.stringify({ title: 'Pycha 😋 #fyp' })), gemini: () => geminiOk(recipePayload) })
    const err = await parseTikTokCaption(VIDEO, { geminiApiKey: 'K', fetchImpl }).catch((e) => e)
    expect(err.code).toBe('no_recipe_in_caption')
    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]))
    expect(calls.some((u) => u.includes('generativelanguage'))).toBe(false)
  })

  it('bez klucza Gemini → ai_unavailable', async () => {
    const fetchImpl = router({ oembed })
    await expect(parseTikTokCaption(VIDEO, { fetchImpl })).rejects.toMatchObject({ code: 'ai_unavailable' })
  })

  it('awaria Gemini → ai_failed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchImpl = router({ oembed, gemini: () => new Response('boom', { status: 500 }) })
    await expect(parseTikTokCaption(VIDEO, { geminiApiKey: 'K', fetchImpl, geminiRetryDelayMs: 0 })).rejects.toMatchObject({ code: 'ai_failed' })
  })

  it('opis z samymi składnikami zwraca wynik częściowy', async () => {
    const fetchImpl = router({
      oembed,
      gemini: () => geminiOk({ is_recipe: true, title: 'Placki', ingredients: [{ text: 'ziemniaki' }, { text: 'jajka' }], steps: [] }),
    })
    const d = await parseTikTokCaption(VIDEO, { geminiApiKey: 'K', fetchImpl, geminiRetryDelayMs: 0 })
    expect(d.ingredients).toHaveLength(2)
    expect(d.steps).toHaveLength(0)
  })
})

describe('parseRecipeUrl: rozdzielanie ścieżek', () => {
  it('link TikToka → origin tiktok-caption', async () => {
    const fetchImpl = router({
      oembed: () => new Response(JSON.stringify({ title: CAPTION })),
      gemini: () => geminiOk(recipePayload),
    })
    const out = await parseRecipeUrl(`${VIDEO}?lang=pl`, { geminiApiKey: 'K', fetchImpl, geminiRetryDelayMs: 0 })
    expect(out.origin).toBe('tiktok-caption')
  })

  it('zwykła strona → origin page, bez pytania TikToka', async () => {
    const html = `<script type="application/ld+json">${JSON.stringify({ '@type': 'Recipe', name: 'Zupa', recipeIngredient: ['woda'], recipeInstructions: ['gotuj'] })}</script>`
    const fetchImpl = router({ page: () => new Response(html, { headers: { 'content-type': 'text/html' } }) })
    const out = await parseRecipeUrl('http://8.8.8.8/przepis', { fetchImpl })
    expect(out.origin).toBe('page')
    expect(out.draft.title).toBe('Zupa')
    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]))
    expect(calls.some((u) => u.includes('oembed'))).toBe(false)
  })
})
