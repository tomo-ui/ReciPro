import { assertPublicUrl, FetchError, fetchHtml } from './fetchHtml.js'
import { normalizeTags } from './normalize.js'

/**
 * Odczyt opisu filmu z TikToka. Czytamy wyłącznie tekst opisu (caption) —
 * nie pobieramy samego wideo, dźwięku ani napisów z filmu.
 */

const TIKTOK_HOST = /(^|\.)tiktok\.com$/i
// Kanoniczny film: /@autor/video/123…  (albo karuzela zdjęć: /@autor/photo/123…)
const CANONICAL_PATH = /^\/@[^/]+\/(video|photo)\/\d+/

export function isTikTokUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    return (u.protocol === 'http:' || u.protocol === 'https:') && TIKTOK_HOST.test(u.hostname)
  } catch {
    return false
  }
}

export interface TikTokInfo {
  /** Adres kanoniczny bez parametrów śledzących */
  canonicalUrl: string
  caption: string
  author?: string
  /** Podpisany adres miniaturki — wygasa po ok. 48 h, trzeba go zapisać u siebie (image.ts) */
  thumbnailUrl?: string
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

/**
 * Skrócone linki (vm.tiktok.com/…, vt.tiktok.com/…, tiktok.com/t/…) przekierowują na adres filmu.
 * Idziemy za przekierowaniami ręcznie: każdy hop musi być publicznym adresem w domenie tiktok.com.
 */
export async function resolveTikTokUrl(raw: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new FetchError('invalid_url', 'To nie jest poprawny adres URL.')
  }

  for (let hop = 0; hop < 5; hop++) {
    if (!TIKTOK_HOST.test(url.hostname)) throw new FetchError('blocked', 'Ten adres jest niedozwolony.')
    await assertPublicUrl(url)

    if (CANONICAL_PATH.test(url.pathname)) return `https://www.tiktok.com${url.pathname.match(CANONICAL_PATH)![0]}`

    let res: Response
    try {
      res = await fetchImpl(url, {
        redirect: 'manual',
        headers: { 'user-agent': UA },
        signal: AbortSignal.timeout(6000),
      })
    } catch {
      throw new FetchError('network', 'Nie udało się połączyć z TikTokiem.')
    }
    await res.body?.cancel().catch(() => {})

    const loc = res.headers.get('location')
    if (res.status >= 300 && res.status < 400 && loc) {
      url = new URL(loc, url)
      continue
    }
    break
  }
  throw new FetchError('invalid_url', 'To nie wygląda na link do filmu z TikToka.')
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined)

/** Opis z oficjalnego endpointu oEmbed (najstabilniejszy, bez autoryzacji) */
async function fromOEmbed(canonicalUrl: string, fetchImpl: typeof fetch): Promise<Omit<TikTokInfo, 'canonicalUrl'> | null> {
  try {
    const res = await fetchImpl(`https://www.tiktok.com/oembed?url=${encodeURIComponent(canonicalUrl)}`, {
      headers: { 'user-agent': UA, accept: 'application/json' },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return null
    const j = (await res.json()) as Record<string, unknown>
    const caption = str(j.title)
    return caption ? { caption, author: str(j.author_name), thumbnailUrl: str(j.thumbnail_url) } : null
  } catch {
    return null
  }
}

/** Awaryjnie: opis z danych osadzonych w stronie filmu */
export function captionFromPageHtml(html: string): Omit<TikTokInfo, 'canonicalUrl'> | null {
  const m = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/)
  if (!m) return null
  try {
    const data = JSON.parse(m[1]) as any
    const item = data?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct
    const caption = str(item?.desc)
    return caption
      ? {
          caption,
          author: str(item?.author?.uniqueId),
          thumbnailUrl: str(item?.video?.originCover) ?? str(item?.video?.cover),
        }
      : null
  } catch {
    return null
  }
}

export async function fetchTikTokInfo(rawUrl: string, fetchImpl: typeof fetch = fetch): Promise<TikTokInfo> {
  const canonicalUrl = await resolveTikTokUrl(rawUrl, fetchImpl)

  const viaOEmbed = await fromOEmbed(canonicalUrl, fetchImpl)
  if (viaOEmbed) {
    // oEmbed bywa bez miniaturki (zależnie od regionu serwera) — próbujemy jeszcze danych ze strony filmu
    if (!viaOEmbed.thumbnailUrl) {
      try {
        const { html } = await fetchHtml(canonicalUrl, { fetchImpl, timeoutMs: 5000 })
        viaOEmbed.thumbnailUrl = captionFromPageHtml(html)?.thumbnailUrl
      } catch {
        /* bez miniaturki — przepis i tak się zaimportuje */
      }
    }
    return { canonicalUrl, ...viaOEmbed }
  }

  try {
    const { html } = await fetchHtml(canonicalUrl, { fetchImpl })
    const viaPage = captionFromPageHtml(html)
    if (viaPage) return { canonicalUrl, ...viaPage }
  } catch {
    /* strona zablokowana — komunikat poniżej */
  }
  throw new FetchError('http_error', 'Nie udało się pobrać opisu filmu. Może być prywatny, usunięty albo niedostępny.')
}

// Hasztagi, które nic nie mówią o daniu
const GENERIC_TAGS = new Set([
  'fyp', 'fy', 'foryou', 'foryoupage', 'fypage', 'fypシ', 'dlaciebie', 'dc', 'viral', 'viralvideo', 'trending',
  'tiktok', 'tiktokpolska', 'polska', 'poland', 'polish', 'xyzbca', 'przepis', 'przepisy', 'recipe', 'recipes',
  'food', 'foodtok', 'cooking', 'gotowanie', 'kuchnia', 'jedzenie',
])

/** Odrzuca ogólne tagi (#fyp, #recipe…) — dotyczy też tagów zwróconych przez model */
export const withoutGenericTags = (tags: string[]): string[] => tags.filter((t) => !GENERIC_TAGS.has(t))

/** Hasztagi z opisu → tagi przepisu (bez ogólnych typu #fyp) */
export function hashtagsFromCaption(caption: string): string[] {
  const tags = [...caption.matchAll(/#([\p{L}\p{N}_]+)/gu)].map((m) => m[1].toLowerCase()).filter((t) => t.length >= 3)
  return normalizeTags(withoutGenericTags(tags))
}
