import { FetchError, fetchHtml } from './fetchHtml.js'
import { fetchTikTokInfo, isTikTokUrl } from './tiktok.js'

/**
 * Odczyt opisu posta z Instagrama i filmu z YouTube (oraz TikToka) plus wyszukiwanie w opisie linku do przepisu.
 * Czytamy wyłącznie tekst opisu; nie pobieramy wideo, dźwięku ani napisów.
 *
 *  • YouTube: opis (`shortDescription`) siedzi w danych osadzonych na stronie filmu.
 *  • Instagram: bez logowania dostępne są tylko metadane podglądu linku (og:title / og:description / og:image),
 *    które serwer zwraca robotom podglądów. Zdarza się, że Instagram odmawia serwerom w chmurze — wtedy
 *    zgłaszamy to wprost, a użytkownik może wkleić link do przepisu z opisu.
 */

export type SocialPlatform = 'tiktok' | 'instagram' | 'youtube'

export interface SocialInfo {
  platform: SocialPlatform
  /** Adres kanoniczny bez parametrów śledzących */
  canonicalUrl: string
  caption: string
  /** Tytuł filmu (YouTube); w opisie postów zwykle go nie ma */
  title?: string
  author?: string
  /** Adres miniaturki na dozwolonym CDN (patrz image.ts) */
  thumbnailUrl?: string
  /**
   * Miniaturka pochodzi z podglądu linku (og:image), który w wideo i rolkach Instagrama ma na środku wypalony przycisk „play”.
   * Kadrujemy ją tak, żeby środek obrazu nie trafił na okładkę (patrz cropToCover).
   */
  thumbnailMayShowPlayButton?: boolean
}

const INSTAGRAM_HOST = /(^|\.)instagram\.com$|^instagr\.am$/i
const YOUTUBE_HOST = /(^|\.)youtube\.com$|(^|\.)youtube-nocookie\.com$|^youtu\.be$/i

export function socialPlatform(raw: string): SocialPlatform | undefined {
  if (isTikTokUrl(raw)) return 'tiktok'
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return undefined
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined
  if (INSTAGRAM_HOST.test(u.hostname)) return 'instagram'
  if (YOUTUBE_HOST.test(u.hostname)) return 'youtube'
  return undefined
}

export const PLATFORM_NAME: Record<SocialPlatform, string> = { tiktok: 'TikToka', instagram: 'Instagrama', youtube: 'YouTube' }

const CODE = /^[A-Za-z0-9_-]{5,20}$/

/** Kod posta z linku: /p/KOD, /reel/KOD, /reels/KOD, /tv/KOD, także z nazwą konta przed nimi */
export function instagramCode(raw: string): string | undefined {
  try {
    const m = new URL(raw).pathname.match(/^\/(?:[^/]+\/)?(?:p|reel|reels|tv)\/([^/]+)/)
    return m && CODE.test(m[1]) ? m[1] : undefined
  } catch {
    return undefined
  }
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

/** Identyfikator filmu: youtu.be/ID, /watch?v=ID, /shorts/ID, /live/ID, /embed/ID */
export function youtubeId(raw: string): string | undefined {
  try {
    const u = new URL(raw)
    let id: string | null | undefined
    if (u.hostname.toLowerCase() === 'youtu.be') id = u.pathname.split('/')[1]
    else if (u.pathname === '/watch') id = u.searchParams.get('v')
    else id = u.pathname.match(/^\/(?:shorts|live|embed|v)\/([^/?]+)/)?.[1]
    return id && VIDEO_ID.test(id) ? id : undefined
  } catch {
    return undefined
  }
}

/* — meta-tagi — */

const NAMED: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' }

/** Dekoduje encje HTML w wartości atrybutu (&quot;, &amp;, &#x2019;, &#39;…) */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m
    }
    return NAMED[e.toLowerCase()] ?? m
  })
}

/**
 * Wartość meta-tagu z pełnego HTML-a (regexem, bo strona YouTube ma ponad 1 MB, a og:image leży w jej środku).
 * Atrybuty mogą być w dowolnej kolejności.
 */
export function metaContent(html: string, name: string): string | undefined {
  const n = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const a = html.match(new RegExp(`<meta[^>]*?(?:property|name)=["']${n}["'][^>]*?content="([^"]*)"`, 'i'))
  const b = html.match(new RegExp(`<meta[^>]*?content="([^"]*)"[^>]*?(?:property|name)=["']${n}["']`, 'i'))
  const raw = (a ?? b)?.[1]
  return raw ? decodeEntities(raw).trim() || undefined : undefined
}

/* — YouTube — */

const decodeJsonString = (s: string): string => {
  try {
    return JSON.parse(`"${s}"`) as string
  } catch {
    return s
  }
}

/** Dane filmu z HTML strony: opis, tytuł, autor i miniaturka */
export function parseYouTubeHtml(html: string, id: string): Omit<SocialInfo, 'platform' | 'canonicalUrl'> | null {
  const grab = (key: string) => {
    const m = html.match(new RegExp(`"${key}":"((?:[^"\\\\]|\\\\.)*)"`))
    return m ? decodeJsonString(m[1]) : undefined
  }
  const meta = (name: string) => metaContent(html, name)
  // Opis bywa w kilku miejscach: dane odtwarzacza, mikroformat i panel opisu pod filmem. Gdy YouTube utnie dane
  // odtwarzacza (np. „potwierdź, że nie jesteś botem” dla serwerów w chmurze), opis zostaje w danych strony.
  const attributed = html.match(/"attributedDescription":\{"content":"((?:[^"\\]|\\.)*)"/)?.[1]
  const micro = html.match(/"playerMicroformatRenderer":[\s\S]{0,6000}?"description":\{"simpleText":"((?:[^"\\]|\\.)*)"/)?.[1]
  const description =
    grab('shortDescription') ?? (micro ? decodeJsonString(micro) : undefined) ?? (attributed ? decodeJsonString(attributed) : undefined) ?? meta('og:description')

  const title = html.match(/"videoDetails":\{[^{}]*?"title":"((?:[^"\\]|\\.)*)"/)?.[1]
  // videoDetails ma zagnieżdżone obiekty (miniatury), więc autora szukamy po samym kluczu
  const author = html.match(/"author":"((?:[^"\\]|\\.)*)"/)?.[1]
  const caption = (description ?? '').trim()
  if (!caption && !title) return null
  return {
    caption,
    title: title ? decodeJsonString(title) : meta('og:title') ?? meta('title') ?? html.match(/<title>([^<]*)<\/title>/i)?.[1]?.replace(/ - YouTube$/, ''),
    author: author ? decodeJsonString(author) : undefined,
    thumbnailUrl: meta('og:image') ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  }
}

/** Oficjalne API YouTube Data v3 (klucz YOUTUBE_API_KEY): działa też z serwerów w chmurze, których strona filmu nie wpuszcza */
async function fromYouTubeApi(id: string, apiKey: string, fetchImpl: typeof fetch): Promise<Omit<SocialInfo, 'platform' | 'canonicalUrl'> | null> {
  try {
    const res = await fetchImpl(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${id}&key=${encodeURIComponent(apiKey)}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const j = (await res.json()) as { items?: { snippet?: { title?: string; description?: string; channelTitle?: string; thumbnails?: Record<string, { url?: string; width?: number }> } }[] }
    const sn = j.items?.[0]?.snippet
    if (!sn) return null
    const thumbs = Object.values(sn.thumbnails ?? {}).filter((t) => t.url).sort((a, b) => (b.width ?? 0) - (a.width ?? 0))
    return {
      caption: (sn.description ?? '').trim(),
      title: sn.title,
      author: sn.channelTitle,
      thumbnailUrl: thumbs[0]?.url ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    }
  } catch {
    return null
  }
}

export async function fetchYouTubeInfo(rawUrl: string, fetchImpl: typeof fetch = fetch, apiKey?: string): Promise<SocialInfo> {
  const id = youtubeId(rawUrl)
  if (!id) throw new FetchError('invalid_url', 'To nie wygląda na link do filmu z YouTube (np. youtube.com/watch?v=… albo youtu.be/…).')
  const canonicalUrl = `https://www.youtube.com/watch?v=${id}`

  if (apiKey) {
    const viaApi = await fromYouTubeApi(id, apiKey, fetchImpl)
    if (viaApi?.caption) return { platform: 'youtube', canonicalUrl, ...viaApi }
  }

  let html: string
  try {
    ;({ html } = await fetchHtml(canonicalUrl, {
      fetchImpl,
      timeoutMs: 9000,
      maxBytes: 4_000_000,
      // SOCS/CONSENT: potwierdzona zgoda, żeby serwer w UE nie dostał ekranu zgody zamiast strony filmu
      headers: { 'accept-language': 'pl,en;q=0.8', cookie: 'SOCS=CAI; CONSENT=YES+1' },
    }))
  } catch (e) {
    if (e instanceof FetchError) throw e
    throw new FetchError('network', 'Nie udało się połączyć z YouTube.')
  }
  const parsed = parseYouTubeHtml(html, id)
  if (!parsed?.caption) {
    throw new FetchError(
      'http_error',
      'Nie udało się odczytać opisu filmu: jest prywatny albo usunięty, nie ma opisu, albo YouTube zablokował odczyt z serwera. Wklej link do przepisu z opisu filmu albo dodaj przepis ręcznie.',
    )
  }
  return { platform: 'youtube', canonicalUrl, ...parsed }
}

/* — Instagram — */

// Robot podglądów linków: Instagram zwraca mu meta-tagi z opisem posta (zwykła przeglądarka dostaje ekran logowania)
const PREVIEW_BOT_UA = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uhtml.php)'

/** Wyciąga treść opisu z tekstu w rodzaju `konto on Instagram: "opis"` albo `12 likes, 3 comments - konto on data: "opis"` */
function captionFromPreviewText(text: string): { caption: string; author?: string } | null {
  const q = text.match(/:\s*[“"„]([\s\S]*)$/)
  if (!q) return null
  const caption = q[1].replace(/[”"“]\.?\s*$/, '').trim()
  if (!caption) return null
  const author = text.match(/^(.*?)\s+(?:on|na)\s+Instagram/i)?.[1]?.trim()
  return { caption, author: author && author.length <= 60 ? author : undefined }
}

export function parseInstagramHtml(html: string): Omit<SocialInfo, 'platform' | 'canonicalUrl'> | null {
  const meta = (name: string) => metaContent(html, name)

  // og:title zwykle niesie cały opis; og:description bywa dłuższy o liczbę polubień — bierzemy dłuższy opis z obu
  const candidates = [meta('og:title'), meta('og:description'), meta('description')]
    .map((t) => (t ? captionFromPreviewText(t) : null))
    .filter((c): c is { caption: string; author?: string } => !!c)
  if (candidates.length === 0) return null
  const best = candidates.reduce((a, b) => (b.caption.length > a.caption.length ? b : a))
  const image = meta('og:image')
  return { caption: best.caption, author: candidates.find((c) => c.author)?.author, thumbnailUrl: image }
}

/**
 * Czyste zdjęcie posta ze strony osadzenia (embed): to samo, co widać w poście, bez przycisku „play” wypalonego w podglądzie
 * linku. Strona jest publiczna; przy błędzie zwracamy undefined i zostaje miniaturka z podglądu.
 */
export function parseInstagramEmbedImage(html: string): string | undefined {
  const tag = html.match(/<img\b[^>]*\bclass="[^"]*\bEmbeddedMediaImage\b[^"]*"[^>]*>/i)?.[0]
  const src = tag?.match(/\bsrc="([^"]+)"/i)?.[1]
  const url = src ? decodeEntities(src).trim() : ''
  return /^https:\/\//i.test(url) ? url : undefined
}

async function fetchInstagramEmbedImage(code: string, fetchImpl: typeof fetch): Promise<string | undefined> {
  try {
    const { html } = await fetchHtml(`https://www.instagram.com/p/${code}/embed/captioned/`, { fetchImpl, timeoutMs: 6000, maxBytes: 2_000_000 })
    return parseInstagramEmbedImage(html)
  } catch {
    return undefined
  }
}

export async function fetchInstagramInfo(rawUrl: string, fetchImpl: typeof fetch = fetch): Promise<SocialInfo> {
  const code = instagramCode(rawUrl)
  if (!code) throw new FetchError('invalid_url', 'To nie wygląda na link do posta ani rolki z Instagrama (np. instagram.com/p/… albo instagram.com/reel/…).')
  const canonicalUrl = `https://www.instagram.com/p/${code}/`

  let html: string
  try {
    ;({ html } = await fetchHtml(canonicalUrl, { fetchImpl, timeoutMs: 9000, maxBytes: 3_000_000, headers: { 'user-agent': PREVIEW_BOT_UA } }))
  } catch (e) {
    if (e instanceof FetchError) throw e
    throw new FetchError('network', 'Nie udało się połączyć z Instagramem.')
  }
  const parsed = parseInstagramHtml(html)
  if (!parsed) {
    throw new FetchError(
      'http_error',
      'Instagram nie udostępnił opisu tego posta. Może być prywatny, usunięty albo Instagram zablokował odczyt z serwera. Wklej link do przepisu z opisu posta albo dodaj przepis ręcznie.',
    )
  }
  const embedImage = await fetchInstagramEmbedImage(code, fetchImpl)
  if (embedImage) return { platform: 'instagram', canonicalUrl, ...parsed, thumbnailUrl: embedImage }
  // tylko podgląd linku: w wideo ma na środku przycisk „play”, więc oznaczamy, żeby okładka go ominęła
  return { platform: 'instagram', canonicalUrl, ...parsed, ...(parsed.thumbnailUrl ? { thumbnailMayShowPlayButton: true } : {}) }
}

/** Opis posta lub filmu z dowolnego z obsługiwanych serwisów */
export async function fetchSocialInfo(rawUrl: string, fetchImpl: typeof fetch = fetch, opts: { youtubeApiKey?: string } = {}): Promise<SocialInfo> {
  const platform = socialPlatform(rawUrl)
  if (platform === 'youtube') return fetchYouTubeInfo(rawUrl, fetchImpl, opts.youtubeApiKey)
  if (platform === 'instagram') return fetchInstagramInfo(rawUrl, fetchImpl)
  if (platform === 'tiktok') {
    const t = await fetchTikTokInfo(rawUrl, fetchImpl)
    return { platform, canonicalUrl: t.canonicalUrl, caption: t.caption, author: t.author, thumbnailUrl: t.thumbnailUrl }
  }
  throw new FetchError('invalid_url', 'To nie jest link do posta ani filmu.')
}

/* — linki w opisie — */

// Serwisy, które nie prowadzą do przepisu: media społecznościowe, listy linków, sklepy, komunikatory, wsparcie twórcy
const SKIP_HOST =
  /(^|\.)(instagram\.com|instagr\.am|facebook\.com|fb\.com|fb\.me|youtube\.com|youtu\.be|tiktok\.com|twitter\.com|x\.com|t\.co|threads\.net|pinterest\.[a-z.]+|linktr\.ee|linkin\.bio|beacons\.ai|bio\.link|lnk\.bio|spotify\.com|wa\.me|whatsapp\.com|t\.me|discord\.(gg|com)|patreon\.com|paypal\.[a-z.]+|buymeacoffee\.com|ko-fi\.com|amazon\.[a-z.]+|amzn\.(to|eu)|allegro\.pl|ceneo\.pl|aliexpress\.com|ebay\.[a-z.]+|google\.com|goo\.gl|apple\.com|play\.google\.com|twitch\.tv|snapchat\.com)$/i
const SKIP_EXT = /\.(jpe?g|png|gif|webp|mp4|mov|pdf|zip|mp3)(\?|$)/i
const HINT = /przepis|recipe|pełn|full|więcej|blog|strona|sprawdź|zobacz|tutaj|link|instrukcj|składnik/i

/**
 * Adresy z opisu, pod którymi może być przepis (najlepsze pierwsze): najpierw te poprzedzone słowami typu
 * „przepis”, „pełny przepis”, „link”, potem reszta w kolejności występowania. Bez mediów społecznościowych,
 * list linków, sklepów i plików.
 */
export function linksFromCaption(caption: string, selfUrl?: string, max = 3): string[] {
  const found: { url: string; score: number; at: number }[] = []
  const seen = new Set<string>()
  const re = /(?:https?:\/\/|www\.)[^\s<>"'\])}]+/gi
  for (const m of caption.matchAll(re)) {
    let raw = m[0].replace(/[.,;:!?)»”…]+$/g, '')
    if (raw.toLowerCase().startsWith('www.')) raw = `https://${raw}`
    let u: URL
    try {
      u = new URL(raw)
    } catch {
      continue
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') continue
    if (!u.hostname.includes('.') || SKIP_HOST.test(u.hostname) || SKIP_EXT.test(u.pathname)) continue
    const key = `${u.hostname}${u.pathname}${u.search}`.toLowerCase().replace(/\/$/, '')
    if (seen.has(key) || (selfUrl && raw.startsWith(selfUrl))) continue
    seen.add(key)
    const before = caption.slice(Math.max(0, (m.index ?? 0) - 70), m.index)
    found.push({ url: u.href, score: HINT.test(before) ? 1 : 0, at: m.index ?? 0 })
  }
  return found.sort((a, b) => b.score - a.score || a.at - b.at).slice(0, max).map((f) => f.url)
}
