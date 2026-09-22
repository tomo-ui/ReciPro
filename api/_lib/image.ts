import jpeg from 'jpeg-js'
import { assertPublicUrl, readCapped } from './fetchHtml.js'

/**
 * Miniaturka filmu z TikToka. Adres z oEmbed jest podpisany i wygasa po ok. 48 h,
 * więc pobieramy obraz po stronie serwera, przycinamy do formatu okładki przepisu (4:3)
 * i zapisujemy w Supabase Storage (bucket `recipe-images`, patrz supabase/storage.sql).
 */

// Dozwolone CDN miniaturek:
//  TikTok:    p16-common-sign.tiktokcdn-eu.com, …tiktokcdn.com, …tiktokcdn-us.com
//  YouTube:   i.ytimg.com, i9.ytimg.com
//  Instagram: scontent.cdninstagram.com, scontent-waw1-1.cdninstagram.com, instagram.fwaw1-1.fna.fbcdn.net
const CDN_HOST = /(^|\.)(tiktokcdn(-[a-z]+)?\.com|ytimg\.com|cdninstagram\.com|fbcdn\.net)$/i

/** Referer zgodny z serwisem, z którego pochodzi miniaturka (część CDN odrzuca żądania bez niego) */
const refererFor = (host: string) =>
  /tiktokcdn/i.test(host) ? 'https://www.tiktok.com/' : /ytimg/i.test(host) ? 'https://www.youtube.com/' : 'https://www.instagram.com/'
const MAX_IMAGE_BYTES = 1_500_000 // obserwowane miniaturki: 110–240 KB
const MAX_REDIRECTS = 3

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

/**
 * Proporcje okładki: takie same jak karta na liście (RecipeCard: aspect-[4/3]),
 * dzięki czemu zdjęcie z TikToka ma ten sam kadr co zdjęcia ze stron z przepisami.
 */
export const COVER_ASPECT = 4 / 3
const JPEG_QUALITY = 82

export interface DownloadedImage {
  bytes: Uint8Array
  contentType: string
}

/** Typ obrazu z pierwszych bajtów — nagłówkowi Content-Type nie ufamy */
export function sniffImageType(b: Uint8Array): string | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    return 'image/webp'
  }
  return null // np. HEIC, którego większość przeglądarek nie wyświetli
}

/** Miniaturki TikToka mają 1080 px szerokości; zdjęcia ze stron z przepisami zwykle 600–1200 px */
export const COVER_MAX_WIDTH = 800

/** Zmniejszanie przez uśrednianie powierzchni (box filter) — ostre i bez zniekształceń */
function resizeRGBA(src: Uint8Array, sw: number, sh: number, dw: number, dh: number): Uint8Array {
  const dst = new Uint8Array(dw * dh * 4)
  const xr = sw / dw
  const yr = sh / dh
  for (let y = 0; y < dh; y++) {
    const sy0 = y * yr
    const sy1 = (y + 1) * yr
    const iy1 = Math.min(sh, Math.ceil(sy1))
    for (let x = 0; x < dw; x++) {
      const sx0 = x * xr
      const sx1 = (x + 1) * xr
      const ix1 = Math.min(sw, Math.ceil(sx1))
      let r = 0
      let g = 0
      let b = 0
      let total = 0
      for (let yy = Math.floor(sy0); yy < iy1; yy++) {
        const wy = Math.min(yy + 1, sy1) - Math.max(yy, sy0)
        for (let xx = Math.floor(sx0); xx < ix1; xx++) {
          const w = (Math.min(xx + 1, sx1) - Math.max(xx, sx0)) * wy
          const i = (yy * sw + xx) * 4
          r += src[i] * w
          g += src[i + 1] * w
          b += src[i + 2] * w
          total += w
        }
      }
      const o = (y * dw + x) * 4
      dst[o] = r / total
      dst[o + 1] = g / total
      dst[o + 2] = b / total
      dst[o + 3] = 255
    }
  }
  return dst
}

/**
 * Kadruje miniaturkę do okładki przepisu: pionowy kadr (TikTok: 9:16) przycinamy do poziomego 4:3
 * (bierzemy środek obrazu), a potem zmniejszamy do COVER_MAX_WIDTH. Obraz, który już spełnia oba
 * warunki, zostaje bez zmian (bajt w bajt).
 *
 * `avoidCenter`: miniatura ma na środku wypalony przycisk „play” (podgląd wideo z Instagrama), więc z pionowego obrazu
 * bierzemy górny pas zamiast środkowego — przycisk zostaje poza okładką.
 */
export function cropToCover(bytes: Uint8Array, opts: { avoidCenter?: boolean } = {}): Uint8Array {
  const img = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true })
  const cropHeight = Math.min(img.height, Math.round(img.width / COVER_ASPECT))
  const outWidth = Math.min(img.width, COVER_MAX_WIDTH)
  if (cropHeight === img.height && outWidth === img.width) return bytes

  const top = opts.avoidCenter ? 0 : Math.floor((img.height - cropHeight) / 2)
  const rowBytes = img.width * 4
  let data: Uint8Array = img.data.subarray(top * rowBytes, (top + cropHeight) * rowBytes)
  let width = img.width
  let height = cropHeight

  if (outWidth < width) {
    const outHeight = Math.round(outWidth * (height / width))
    data = resizeRGBA(data, width, height, outWidth, outHeight)
    width = outWidth
    height = outHeight
  }
  return new Uint8Array(jpeg.encode({ data, width, height }, JPEG_QUALITY).data)
}

export interface DownloadResult {
  image?: DownloadedImage
  /** Krótki, bezpieczny powód porażki — trafia do komunikatu w aplikacji i do logów */
  reason?: string
}

/**
 * Pobiera miniaturkę wyłącznie z CDN TikToka, YouTube lub Instagrama (https, publiczny adres). Przekierowania idą ręcznie,
 * a każdy hop musi znowu być https, w domenie CDN i pod publicznym adresem.
 */
export async function downloadThumbnail(
  rawUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DownloadResult> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return { reason: 'nieprawidłowy adres miniaturki' }
  }

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (url.protocol !== 'https:' || !CDN_HOST.test(url.hostname)) {
        return { reason: `adres miniaturki poza CDN (${url.hostname})` }
      }
      await assertPublicUrl(url)

      const res = await fetchImpl(url, {
        redirect: 'manual',
        headers: {
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
          accept: 'image/jpeg,image/png,image/webp,image/*;q=0.8',
          referer: refererFor(url.hostname),
        },
        signal: AbortSignal.timeout(8000),
      })

      const location = res.headers.get('location')
      if (res.status >= 300 && res.status < 400 && location) {
        await res.body?.cancel().catch(() => {})
        url = new URL(location, url)
        continue
      }
      if (!res.ok) {
        await res.body?.cancel().catch(() => {})
        return { reason: `pobranie miniaturki: HTTP ${res.status}` }
      }

      const bytes = await readCapped(res, MAX_IMAGE_BYTES)
      const contentType = sniffImageType(bytes)
      if (!contentType) return { reason: 'miniaturka w nieobsługiwanym formacie' }
      return { image: { bytes, contentType } }
    }
    return { reason: 'pobranie miniaturki: zbyt wiele przekierowań' }
  } catch (e) {
    const name = (e as Error).name
    if (name === 'TimeoutError' || name === 'AbortError') return { reason: 'pobranie miniaturki: przekroczono czas' }
    return { reason: `pobranie miniaturki: ${(e as Error).message}`.slice(0, 120) }
  }
}

/** Kadruje pobraną miniaturkę do okładki 4:3; przy niepowodzeniu (np. uszkodzony plik) zostawia oryginał */
export function prepareCover(img: DownloadedImage, opts: { avoidCenter?: boolean } = {}): DownloadedImage {
  if (img.contentType !== 'image/jpeg') return img
  try {
    return { bytes: cropToCover(img.bytes, opts), contentType: 'image/jpeg' }
  } catch (e) {
    console.warn('[image] nie udało się przyciąć miniaturki, zapisuję oryginał:', (e as Error).message)
    return img
  }
}

export interface StorageConfig {
  supabaseUrl: string
  anonKey: string
  /** Token sesji użytkownika — zapis idzie jako on, więc obowiązują polityki RLS z storage.sql */
  userToken: string
  userId: string
}

/** Storage odpowiada JSON-em {"message": …}; wyciągamy sam komunikat zamiast surowego JSON-a */
async function readErrorMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => '')
  try {
    const message = (JSON.parse(text) as { message?: unknown }).message
    if (typeof message === 'string' && message) return message.slice(0, 120)
  } catch {
    /* nie JSON — zwykły tekst poniżej */
  }
  return text.slice(0, 120)
}

/** Zapisuje obraz w `recipe-images/<userId>/<uuid>.<ext>` i zwraca publiczny adres */
export async function uploadRecipeImage(
  img: DownloadedImage,
  { supabaseUrl, anonKey, userToken, userId }: StorageConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const base = supabaseUrl.replace(/\/+$/, '')
  const path = `${userId}/${crypto.randomUUID()}.${EXT[img.contentType]}`

  const res = await fetchImpl(`${base}/storage/v1/object/recipe-images/${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${userToken}`,
      apikey: anonKey,
      'content-type': img.contentType,
      'cache-control': 'max-age=31536000',
    },
    body: new Blob([img.bytes as BlobPart], { type: img.contentType }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`Storage HTTP ${res.status}: ${await readErrorMessage(res)}`)
  return `${base}/storage/v1/object/public/recipe-images/${path}`
}

/** Stara nazwa (miniaturki były najpierw tylko z TikToka) */
export const downloadTikTokThumbnail = downloadThumbnail
