import type { GeminiImage } from './gemini.js'

/** Wklejony tekst: krótszy nie może zawierać przepisu, dłuższy przycinamy (jak tekst strony w gemini.ts) */
export const MIN_PASTED_CHARS = 30
export const MAX_PASTED_CHARS = 20_000

/** Zdjęcia: limit Vercela to 4,5 MB na całe żądanie, a base64 puchnie o ok. 1/3 */
export const MAX_IMAGES = 4
const MAX_IMAGE_BASE64_CHARS = 1_500_000
const MAX_TOTAL_BASE64_CHARS = 3_800_000
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/

/** Tekst z żądania albo null, gdy jest za krótki (lub nie jest tekstem) */
export function cleanPastedText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const text = raw.replace(/\r\n?/g, '\n').trim().slice(0, MAX_PASTED_CHARS)
  return text.length >= MIN_PASTED_CHARS ? text : null
}

/** Zdjęcia z żądania `[{ mimeType, data }]` albo null, gdy cokolwiek jest nieprawidłowe lub za duże */
export function cleanImages(raw: unknown): GeminiImage[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_IMAGES) return null
  const out: GeminiImage[] = []
  let total = 0
  for (const item of raw) {
    const mimeType = (item as { mimeType?: unknown })?.mimeType
    const data = (item as { data?: unknown })?.data
    if (typeof mimeType !== 'string' || !ALLOWED_MIME.has(mimeType)) return null
    if (typeof data !== 'string' || data.length === 0 || data.length > MAX_IMAGE_BASE64_CHARS) return null
    if (!BASE64_RE.test(data)) return null
    total += data.length
    if (total > MAX_TOTAL_BASE64_CHARS) return null
    out.push({ mimeType, data })
  }
  return out
}
