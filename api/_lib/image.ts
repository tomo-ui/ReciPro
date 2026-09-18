import { assertPublicUrl, readCapped } from './fetchHtml.js'

/**
 * Miniaturka filmu z TikToka. Adres z oEmbed jest podpisany i wygasa po ok. 48 h,
 * więc pobieramy obraz po stronie serwera i zapisujemy go w Supabase Storage
 * (bucket `recipe-images`, patrz supabase/storage.sql). Wtedy okładka nie znika.
 */

// CDN TikToka: p16-common-sign.tiktokcdn-eu.com, …tiktokcdn.com, …tiktokcdn-us.com
const CDN_HOST = /(^|\.)tiktokcdn(-[a-z]+)?\.com$/i
const MAX_IMAGE_BYTES = 1_500_000 // obserwowane miniaturki: 110–240 KB

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

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

/** Pobiera miniaturkę wyłącznie z CDN TikToka (https, publiczny adres, bez przekierowań) */
export async function downloadTikTokThumbnail(
  rawUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DownloadedImage | null> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || !CDN_HOST.test(url.hostname)) return null

  try {
    await assertPublicUrl(url)
    const res = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const bytes = await readCapped(res, MAX_IMAGE_BYTES)
    const contentType = sniffImageType(bytes)
    return contentType ? { bytes, contentType } : null
  } catch {
    return null
  }
}

export interface StorageConfig {
  supabaseUrl: string
  anonKey: string
  /** Token sesji użytkownika — zapis idzie jako on, więc obowiązują polityki RLS z storage.sql */
  userToken: string
  userId: string
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
  if (!res.ok) {
    throw new Error(`Storage HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
  }
  return `${base}/storage/v1/object/public/recipe-images/${path}`
}
