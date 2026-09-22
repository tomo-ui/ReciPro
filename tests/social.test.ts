import { describe, expect, it, vi } from 'vitest'
import { fetchInstagramInfo, instagramCode, linksFromCaption, parseInstagramEmbedImage, parseInstagramHtml, parseYouTubeHtml, socialPlatform, youtubeId } from '../api/_lib/social'
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
  /** Strona osadzenia posta (embed); brak = 404 */
  instagramEmbed?: string
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
    if (url.includes('instagram.com/p/') && url.includes('/embed/')) return r.instagramEmbed === undefined ? new Response('nie ma', { status: 404 }) : html(r.instagramEmbed)
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

const EMBED_IMG = 'https://scontent.cdninstagram.com/v/t51/clean_n.jpg?stp=dst-jpg_e15&_nc_ht=scontent.cdninstagram.com&oh=abc'
const embed = (src = EMBED_IMG) => `<html><body><div class="Embed"><img class="EmbeddedMediaImage" alt="" src="${src.replace(/&/g, '&amp;')}"></div></body></html>`

describe('miniatura z Instagrama bez przycisku play', () => {
  it('parseInstagramEmbedImage: czyste zdjęcie ze strony osadzenia (encje w adresie), inaczej undefined', () => {
    expect(parseInstagramEmbedImage(embed())).toBe(EMBED_IMG)
    expect(parseInstagramEmbedImage('<img src="https://x/y.jpg" class="foo EmbeddedMediaImage bar">')).toBe('https://x/y.jpg')
    expect(parseInstagramEmbedImage('<html><img class="Avatar" src="https://x/a.jpg"></html>')).toBeUndefined()
    expect(parseInstagramEmbedImage('<img class="EmbeddedMediaImage" src="http://x/y.jpg">')).toBeUndefined() // tylko https
    expect(parseInstagramEmbedImage('<html></html>')).toBeUndefined()
  })

  it('używa zdjęcia z embed zamiast og:image i nie oznacza go jako podglądu z przyciskiem', async () => {
    const { fetchImpl, calls } = network({ instagram: instagram('Sernik: 1 kg sera, 6 jaj. Utrzyj i piecz godzinę.'), instagramEmbed: embed() })
    const info = await fetchInstagramInfo(IG_URL, fetchImpl)
    expect(info.thumbnailUrl).toBe(EMBED_IMG)
    expect(info.thumbnailUrl).not.toContain('abc_n.jpg') // nie miniatura z podglądu linku
    expect(info.thumbnailMayShowPlayButton).toBeUndefined()
    expect(calls.some((c) => c.url === 'https://www.instagram.com/p/Cabc123XYZ/embed/captioned/')).toBe(true)
  })

  it('bez strony embed zostaje og:image, oznaczony jako podgląd z przyciskiem play (okładka go ominie)', async () => {
    const { fetchImpl } = network({ instagram: instagram('Sernik: 1 kg sera, 6 jaj. Utrzyj i piecz godzinę.') }) // embed 404
    const info = await fetchInstagramInfo(IG_URL, fetchImpl)
    expect(info.thumbnailUrl).toContain('abc_n.jpg')
    expect(info.thumbnailMayShowPlayButton).toBe(true)
    // strona embed bez zdjęcia — to samo
    const { fetchImpl: f2 } = network({ instagram: instagram('Sernik: 1 kg sera, 6 jaj. Utrzyj i piecz godzinę.'), instagramEmbed: '<html>nic</html>' })
    expect((await fetchInstagramInfo(IG_URL, f2)).thumbnailMayShowPlayButton).toBe(true)
  })

  it('post bez żadnej miniatury: brak flagi', async () => {
    const page = '<html><head><meta property="og:title" content="Zosia on Instagram: &quot;Sernik: 1 kg sera, 6 jaj. Utrzyj.&quot;"></head></html>'
    const info = await fetchInstagramInfo(IG_URL, network({ instagram: page }).fetchImpl)
    expect(info.thumbnailUrl).toBeUndefined()
    expect(info.thumbnailMayShowPlayButton).toBeUndefined()
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

describe('YouTube: odczyt, gdy dane odtwarzacza są ucięte (blokada serwerów w chmurze)', () => {
  const blocked = (description: string) =>
    `<html><head><meta property="og:title" content="Sernik babci - YouTube"><meta property="og:image" content="https://i.ytimg.com/vi/abcdefghijk/maxresdefault.jpg"></head><body><script>var ytInitialPlayerResponse = {"playabilityStatus":{"status":"LOGIN_REQUIRED","reason":"Sign in to confirm you're not a bot"}};var ytInitialData = {"attributedDescription":{"content":${JSON.stringify(description)},"commandRuns":[]}};</script></body></html>`

  it('bierze opis z panelu opisu pod filmem (attributedDescription)', () => {
    const d = parseYouTubeHtml(blocked('Składniki:\n- 1 kg sera\nPrzepis: https://blog.example/sernik'), 'abcdefghijk')!
    expect(d.caption).toBe('Składniki:\n- 1 kg sera\nPrzepis: https://blog.example/sernik')
    expect(d.title).toBe('Sernik babci - YouTube')
    expect(d.thumbnailUrl).toContain('maxresdefault')
  })

  it('a gdy nie ma nic więcej, choćby uciętym opisem z og:description', () => {
    const page = `<meta property="og:title" content="Sernik"><meta property="og:description" content="Zaczynamy od składników: 1 kg sera, 6 jaj…">`
    expect(parseYouTubeHtml(page, 'abcdefghijk')?.caption).toBe('Zaczynamy od składników: 1 kg sera, 6 jaj…')
  })

  it('import działa na takiej stronie, a bez żadnego opisu daje czytelny błąd', async () => {
    const ok = await parseRecipeUrl(YT_URL, { ...opts, fetchImpl: network({ youtube: blocked(`Pyszny sernik! Przepis: ${RECIPE_LINK}`), gemini: NONE }).fetchImpl })
    expect(ok.origin).toBe('post-link')
    const err = parseRecipeUrl(YT_URL, { ...opts, fetchImpl: network({ youtube: '<html><head><meta property="og:title" content="Film"></head></html>' }).fetchImpl })
    await expect(err).rejects.toThrow(/zablokował odczyt z serwera/)
  })

  it('wysyła ciasteczko zgody i używa oficjalnego API, gdy jest klucz', async () => {
    const { fetchImpl, calls } = network({ youtube: player('Składniki: 1 kg sera, 6 jaj. Przygotowanie: utrzyj i piecz.'), gemini: FULL })
    await parseRecipeUrl(YT_URL, { ...opts, fetchImpl })
    const page = calls.find((c) => c.url.includes('youtube.com/watch'))!
    expect(String((page.init?.headers as Record<string, string>).cookie)).toContain('SOCS=')

    const api = vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (url.includes('googleapis.com/youtube/v3/videos')) {
        expect(url).toContain('id=abcdefghijk')
        expect(url).toContain('key=YT-KEY')
        return new Response(JSON.stringify({ items: [{ snippet: { title: 'Sernik z API', description: 'Składniki: 1 kg sera, 6 jaj. Przygotowanie: utrzyj i piecz.', channelTitle: 'Kuchnia', thumbnails: { default: { url: 'https://i.ytimg.com/vi/a/default.jpg', width: 120 }, maxres: { url: 'https://i.ytimg.com/vi/a/maxresdefault.jpg', width: 1280 } } } }] }))
      }
      if (url.includes('generativelanguage')) return reply(FULL)
      return new Response('nie ma', { status: 404 })
    }) as unknown as typeof fetch
    const out = await parseRecipeUrl(YT_URL, { ...opts, fetchImpl: api, youtubeApiKey: 'YT-KEY' })
    expect(out.origin).toBe('youtube-caption')
    expect(out.draft.image_url).toBe('https://i.ytimg.com/vi/a/maxresdefault.jpg')
    expect((api as unknown as { mock: { calls: unknown[][] } }).mock.calls.some((c) => String(c[0]).includes('youtube.com/watch'))).toBe(false) // strona filmu nie była potrzebna
  })
})
