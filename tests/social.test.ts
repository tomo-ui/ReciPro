import { describe, expect, it, vi } from 'vitest'
import { instagramCode, linksFromCaption, parseInstagramHtml, parseYouTubeHtml, socialPlatform, youtubeId } from '../api/_lib/social'
import { ParseError, parseRecipeUrl } from '../api/_lib/pipeline'
import { downloadThumbnail } from '../api/_lib/image'

const YT_URL = 'https://www.youtube.com/watch?v=abcdefghijk'
const IG_URL = 'https://www.instagram.com/reel/Cabc123XYZ/?igsh=tracking'
const RECIPE_LINK = 'http://8.8.8.8/sernik-babci'

const player = (description: string, title = 'Sernik babci') =>
  `<html><head><meta property="og:image" content="https://i.ytimg.com/vi/abcdefghijk/maxresdefault.jpg"></head><body><script>var ytInitialPlayerResponse = ${JSON.stringify({
    videoDetails: { videoId: 'abcdefghijk', title, author: 'Kuchnia Zosi', shortDescription: description },
  })};</script></body></html>`

const instagram = (caption: string) =>
  `<html><head><meta property="og:title" content="Zosia on Instagram: &quot;${caption.replace(/"/g, '&quot;')}&quot;"><meta property="og:image" content="https://scontent.cdninstagram.com/v/t51/abc_n.jpg?stp=c128"></head></html>`

const recipePage = (name: string) =>
  `<html><head><script type="application/ld+json">${JSON.stringify({
    '@type': 'Recipe',
    name,
    image: 'https://cdn.example/sernik.jpg',
    recipeIngredient: ['1 kg sera', '6 jaj', '200 g cukru'],
    recipeInstructions: ['Utrzyj ser.', 'Piecz godzinę.'],
  })}</script></head></html>`

const reply = (payload: unknown) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }), { status: 200 })
const html = (body: string) => new Response(body, { headers: { 'content-type': 'text/html' } })

const FULL = { is_recipe: true, title: 'Sernik babci', ingredients: [{ text: '1 kg sera' }, { text: '6 jaj' }], steps: [{ text: 'Utrzyj.' }, { text: 'Piecz.' }] }
const PARTIAL = { is_recipe: true, title: 'Sernik', ingredients: [{ text: '1 kg sera' }, { text: '6 jaj' }], steps: [] }
const NONE = { is_recipe: false, title: '', ingredients: [], steps: [] }

interface Routes {
  youtube?: string
  instagram?: string
  gemini?: unknown
  link?: () => Response
  onGemini?: (body: string) => void
}

/** Atrapa sieci: strony YouTube/Instagram, strona z przepisem pod linkiem, Gemini */
function network(r: Routes) {
  const calls: { url: string; init?: RequestInit }[] = []
  const impl = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init })
    if (url.includes('youtube.com/watch')) return html(r.youtube ?? '<html></html>')
    if (url.includes('instagram.com/p/')) return html(r.instagram ?? '<html></html>')
    if (url.includes('generativelanguage')) {
      r.onGemini?.(String(init?.body))
      return reply(r.gemini ?? NONE)
    }
    if (url.startsWith(RECIPE_LINK)) return r.link?.() ?? html(recipePage('Sernik z linku'))
    return new Response('nie ma', { status: 404 })
  })
  return { fetchImpl: impl as unknown as typeof fetch, calls }
}

const opts = { geminiApiKey: 'K', geminiRetryDelayMs: 0 }

describe('rozpoznawanie linków', () => {
  it('serwis i identyfikatory', () => {
    expect(socialPlatform('https://youtu.be/abcdefghijk')).toBe('youtube')
    expect(socialPlatform('https://m.youtube.com/watch?v=abcdefghijk')).toBe('youtube')
    expect(socialPlatform('https://www.instagram.com/p/Cabc123XYZ/')).toBe('instagram')
    expect(socialPlatform('https://www.tiktok.com/@a/video/1')).toBe('tiktok')
    expect(socialPlatform('https://example.com/przepis')).toBeUndefined()
    expect(socialPlatform('ftp://youtube.com/x')).toBeUndefined()
    expect(socialPlatform('nie url')).toBeUndefined()

    for (const u of ['https://youtu.be/abcdefghijk?t=5', 'https://www.youtube.com/watch?v=abcdefghijk&list=X', 'https://www.youtube.com/shorts/abcdefghijk', 'https://www.youtube.com/live/abcdefghijk', 'https://www.youtube.com/embed/abcdefghijk']) {
      expect(youtubeId(u), u).toBe('abcdefghijk')
    }
    expect(youtubeId('https://www.youtube.com/@kanal')).toBeUndefined()
    expect(youtubeId('https://www.youtube.com/watch?v=za_krotkie')).toBeUndefined()

    for (const u of ['https://www.instagram.com/p/Cabc123XYZ/', 'https://www.instagram.com/reel/Cabc123XYZ/?igsh=1', 'https://www.instagram.com/reels/Cabc123XYZ/', 'https://www.instagram.com/zosia/p/Cabc123XYZ/', 'https://www.instagram.com/tv/Cabc123XYZ']) {
      expect(instagramCode(u), u).toBe('Cabc123XYZ')
    }
    expect(instagramCode('https://www.instagram.com/zosia/')).toBeUndefined()
  })
})

describe('odczyt stron', () => {
  it('YouTube: opis ze znakami specjalnymi, tytuł, autor i miniaturka', () => {
    const d = parseYouTubeHtml(player('Składniki:\n- 1 kg sera\nPrzepis: https://blog.example/x #sernik', 'Sernik "babci" 🍰'), 'abcdefghijk')!
    expect(d.caption).toBe('Składniki:\n- 1 kg sera\nPrzepis: https://blog.example/x #sernik')
    expect(d.title).toBe('Sernik "babci" 🍰')
    expect(d.author).toBe('Kuchnia Zosi')
    expect(d.thumbnailUrl).toBe('https://i.ytimg.com/vi/abcdefghijk/maxresdefault.jpg')
    expect(parseYouTubeHtml('<html>ekran zgody</html>', 'abcdefghijk')).toBeNull()
  })

  it('Instagram: opis z og:title, autor i miniaturka; bez meta-tagów (ekran logowania) brak wyniku', () => {
    const d = parseInstagramHtml(instagram('Placki 🥔 Składniki: 1 kg ziemniaków, 2 jajka. Pełny przepis: https://blog.example/placki'))!
    expect(d.caption).toBe('Placki 🥔 Składniki: 1 kg ziemniaków, 2 jajka. Pełny przepis: https://blog.example/placki')
    expect(d.author).toBe('Zosia')
    expect(d.thumbnailUrl).toContain('cdninstagram.com')
    expect(parseInstagramHtml('<html><title>Instagram</title></html>')).toBeNull()
  })

  it('Instagram: bierze dłuższy z opisów (og:title lub og:description)', () => {
    const page = `<meta property="og:title" content="Z on Instagram: &quot;krótki&quot;"><meta property="og:description" content="1 like, 0 comments - z on May 1, 2026: &quot;dłuższy opis przepisu&quot;">`
    expect(parseInstagramHtml(page)?.caption).toBe('dłuższy opis przepisu')
  })
})

describe('linki w opisie', () => {
  it('pomija media społecznościowe, sklepy i listy linków; najpierw te przy słowie „przepis”', () => {
    const caption = `Obserwuj: https://www.instagram.com/zosia
Sklep: https://www.amazon.pl/dp/1 i https://linktr.ee/zosia
Zdjęcie https://cdn.x.pl/a.jpg
Muzyka https://open.spotify.com/track/1
Blog https://inny.pl/wpis
Pełny przepis: https://blog.example/sernik-babci.
www.kuchnia.pl/przepis?id=3`
    // dwa linki z podpowiedzią („Blog”, „Pełny przepis”) idą przed resztą, w kolejności występowania
    expect(linksFromCaption(caption)).toEqual(['https://inny.pl/wpis', 'https://blog.example/sernik-babci', 'https://www.kuchnia.pl/przepis?id=3'])
  })

  it('usuwa końcową interpunkcję i duplikaty, pomija adres samego posta, ogranicza liczbę', () => {
    const caption = 'https://a.pl/x, https://a.pl/x/ https://b.pl/y) https://c.pl/z https://d.pl/w https://www.youtube.com/watch?v=abcdefghijk'
    const links = linksFromCaption(caption, YT_URL)
    expect(links).toEqual(['https://a.pl/x', 'https://b.pl/y', 'https://c.pl/z'])
    expect(linksFromCaption('brak linków')).toEqual([])
  })
})

describe('import z YouTube', () => {
  it('przepis kompletny w opisie: nie sięga po linki', async () => {
    const { fetchImpl, calls } = network({ youtube: player(`Składniki: 1 kg sera, 6 jaj. Przygotowanie: utrzyj i piecz godzinę.\nWięcej: ${RECIPE_LINK}`), gemini: FULL })
    const out = await parseRecipeUrl(YT_URL, { ...opts, fetchImpl })
    expect(out.origin).toBe('youtube-caption')
    expect(out.draft.title).toBe('Sernik babci')
    expect(out.draft.source_url).toBe(YT_URL)
    expect(out.draft.image_url).toBe('https://i.ytimg.com/vi/abcdefghijk/maxresdefault.jpg') // tryb lokalny: adres tymczasowy
    expect(calls.some((c) => c.url.startsWith(RECIPE_LINK))).toBe(false)
  })

  it('opis bez przepisu, ale z linkiem: czyta stronę pod linkiem', async () => {
    const { fetchImpl, calls } = network({ youtube: player(`Pyszny sernik na święta! Pełny przepis: ${RECIPE_LINK} Zapraszam do subskrypcji.`), gemini: NONE })
    const out = await parseRecipeUrl(YT_URL, { ...opts, fetchImpl })
    expect(out.origin).toBe('post-link')
    expect(out.draft.title).toBe('Sernik z linku')
    expect(out.draft.source_url).toBe(RECIPE_LINK)
    expect(out.draft.ingredients).toHaveLength(3)
    expect(out.draft.image_url).toBe('https://cdn.example/sernik.jpg') // zdjęcie ze strony przepisu ma pierwszeństwo
    expect(calls.some((c) => c.url.startsWith(RECIPE_LINK))).toBe(true)
  })

  it('krótki opis z samym linkiem też działa, także bez klucza Gemini', async () => {
    const { fetchImpl, calls } = network({ youtube: player(`Przepis: ${RECIPE_LINK}`) })
    const out = await parseRecipeUrl(YT_URL, { fetchImpl })
    expect(out.origin).toBe('post-link')
    expect(out.draft.title).toBe('Sernik z linku')
    expect(calls.some((c) => c.url.includes('generativelanguage'))).toBe(false)
  })

  it('niepełny przepis w opisie + kompletny na stronie z linku: wygrywa strona', async () => {
    const { fetchImpl } = network({ youtube: player(`Składniki: 1 kg sera, 6 jaj. Kroki pod linkiem: ${RECIPE_LINK}`), gemini: PARTIAL })
    const out = await parseRecipeUrl(YT_URL, { ...opts, fetchImpl })
    expect(out.origin).toBe('post-link')
    expect(out.draft.steps).toHaveLength(2)
  })

  it('link nie prowadzi do przepisu: zostaje niepełny przepis z opisu; bez niego jasny błąd', async () => {
    const broken = () => new Response('nie ma', { status: 404 })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const partial = await parseRecipeUrl(YT_URL, { ...opts, fetchImpl: network({ youtube: player(`Składniki: 1 kg sera, 6 jaj. Więcej: ${RECIPE_LINK}`), gemini: PARTIAL, link: broken }).fetchImpl })
    expect(partial.origin).toBe('youtube-caption')
    expect(partial.draft.ingredients).toHaveLength(2)

    const none = parseRecipeUrl(YT_URL, { ...opts, fetchImpl: network({ youtube: player(`Pyszny sernik, przepis tutaj: ${RECIPE_LINK}`), gemini: NONE, link: () => html('<html><body>Kup nasz newsletter</body></html>') }).fetchImpl })
    await expect(none).rejects.toMatchObject({ code: 'no_recipe_in_caption' })
    await expect(none).rejects.toThrow(/link/i)
  })

  it('opis bez przepisu i bez linków; film bez opisu; zły adres', async () => {
    const noRecipe = parseRecipeUrl(YT_URL, { ...opts, fetchImpl: network({ youtube: player('Dzisiaj gotujemy razem, zapraszam serdecznie do oglądania i subskrypcji kanału.'), gemini: NONE }).fetchImpl })
    await expect(noRecipe).rejects.toMatchObject({ code: 'no_recipe_in_caption' })

    const blocked = parseRecipeUrl(YT_URL, { ...opts, fetchImpl: network({ youtube: '<html>zgoda</html>' }).fetchImpl })
    await expect(blocked).rejects.toThrow(/opisu filmu/)
    await expect(parseRecipeUrl('https://www.youtube.com/@kanal', { ...opts, fetchImpl: network({}).fetchImpl })).rejects.toThrow(/link do filmu/)
  })

  it('klucz Gemini wysyła tytuł i opis jako dane, a odpowiedź modelu jest weryfikowana', async () => {
    let sent = '' // pierwsze wywołanie to odczyt przepisu; kolejne (szacowanie porcji) go nie nadpisuje
    const { fetchImpl } = network({ youtube: player('Składniki: 1 kg sera, 6 jaj. Przygotowanie: utrzyj i piecz.'), gemini: FULL, onGemini: (b) => (sent ||= b) })
    await parseRecipeUrl(YT_URL, { ...opts, fetchImpl })
    expect(sent).toContain('Title: Sernik babci')
    expect(sent).toContain('Author: @Kuchnia Zosi')
    expect(sent).toContain('1 kg sera')
  })
})

describe('import z Instagrama', () => {
  it('odczytuje przepis z opisu i miniaturkę z CDN Instagrama', async () => {
    const { fetchImpl, calls } = network({ instagram: instagram('Sernik: 1 kg sera, 6 jaj. Utrzyj i piecz godzinę. #sernik'), gemini: FULL })
    const out = await parseRecipeUrl(IG_URL, { ...opts, fetchImpl })
    expect(out.origin).toBe('instagram-caption')
    expect(out.draft.source_url).toBe('https://www.instagram.com/p/Cabc123XYZ/')
    expect(out.draft.image_url).toContain('cdninstagram.com')
    // Instagram dostaje user-agent robota podglądów linków, a adres bez parametrów śledzących
    const page = calls.find((c) => c.url.includes('instagram.com/p/'))!
    expect(page.url).not.toContain('igsh')
    expect(String((page.init?.headers as Record<string, string>)['user-agent'])).toContain('facebookexternalhit')
  })

  it('opis z linkiem do przepisu: czyta stronę pod linkiem', async () => {
    const { fetchImpl } = network({ instagram: instagram(`Najlepszy sernik 🍰 Przepis w linku: ${RECIPE_LINK}`), gemini: NONE })
    const out = await parseRecipeUrl(IG_URL, { ...opts, fetchImpl })
    expect(out.origin).toBe('post-link')
    expect(out.draft.source_url).toBe(RECIPE_LINK)
  })

  it('Instagram nie oddał opisu (ekran logowania): zrozumiały komunikat z podpowiedzią', async () => {
    const err = await parseRecipeUrl(IG_URL, { ...opts, fetchImpl: network({ instagram: '<html><title>Instagram</title></html>' }).fetchImpl }).catch((e) => e)
    expect(err).not.toBeInstanceOf(ParseError)
    expect(String(err.message)).toMatch(/Instagram nie udostępnił opisu/)
    await expect(parseRecipeUrl('https://www.instagram.com/zosia/', { ...opts, fetchImpl: network({}).fetchImpl })).rejects.toThrow(/link do posta/)
  })
})

describe('miniaturki z CDN YouTube i Instagrama', () => {
  it('dopuszcza ich CDN, odrzuca pozostałe domeny', async () => {
    const bad = vi.fn() as unknown as typeof fetch
    expect((await downloadThumbnail('https://evil.example/a.jpg', bad)).reason).toMatch(/poza CDN/)
    expect((await downloadThumbnail('https://ytimg.com.evil.example/a.jpg', bad)).reason).toMatch(/poza CDN/)
    const notImage = vi.fn(async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch
    for (const host of ['i.ytimg.com', 'scontent.cdninstagram.com', 'scontent.xx.fbcdn.net']) {
      expect((await downloadThumbnail(`https://${host}/x.jpg`, notImage)).reason, host).toMatch(/formacie/) // przeszło walidację hosta, dopiero treść odpadła
    }
  })
})
