import { supabase, usesSupabase } from './supabase'

/**
 * Zdjęcia przepisów. W Supabase Storage (bucket `recipe-images`, folder = id użytkownika);
 * w trybie lokalnym (bez Supabase) obraz trafia do przepisu jako data URL.
 */

const BUCKET = 'recipe-images'
const MARKER = `/storage/v1/object/public/${BUCKET}/`

/** Proporcje i rozmiar okładki — takie same jak po stronie serwera (api/_lib/image.ts) */
export const COVER_ASPECT = 4 / 3
export const COVER_WIDTH = 800

/** Ścieżka pliku w buckecie, jeśli adres wskazuje na nasze zdjęcie; inaczej null (np. zdjęcie ze strony WWW) */
export function storagePathFromUrl(url: string | undefined | null): string | null {
  if (!url) return null
  const i = url.indexOf(MARKER)
  if (i < 0) return null
  const path = decodeURIComponent(url.slice(i + MARKER.length).split('?')[0])
  return path && !path.includes('..') ? path : null
}

/** Środek zdjęcia w formacie 4:3, maks. 800 px szerokości, JPEG — jak okładki importowane z TikToka */
export async function fileToCoverBlob(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const cropHeight = Math.min(bitmap.height, Math.round(bitmap.width / COVER_ASPECT))
    const cropWidth = Math.min(bitmap.width, Math.round(cropHeight * COVER_ASPECT))
    const sx = Math.floor((bitmap.width - cropWidth) / 2)
    const sy = Math.floor((bitmap.height - cropHeight) / 2)
    const outWidth = Math.min(cropWidth, COVER_WIDTH)
    const outHeight = Math.round(outWidth / COVER_ASPECT)

    const canvas = document.createElement('canvas')
    canvas.width = outWidth
    canvas.height = outHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Przeglądarka nie obsługuje przetwarzania obrazów.')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, sx, sy, cropWidth, cropHeight, 0, 0, outWidth, outHeight)

    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Nie udało się przetworzyć zdjęcia.'))), 'image/jpeg', 0.85),
    )
  } finally {
    bitmap.close()
  }
}

/** Rozmiar zdjęcia profilowego (px) — wystarcza na 3× ekranie przy awatarze 84 pt */
export const AVATAR_SIZE = 320

/** Środek zdjęcia jako kwadrat AVATAR_SIZE × AVATAR_SIZE, JPEG — na zdjęcie profilowe */
export async function fileToAvatarBlob(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const side = Math.min(bitmap.width, bitmap.height)
    const sx = Math.floor((bitmap.width - side) / 2)
    const sy = Math.floor((bitmap.height - side) / 2)
    const out = Math.min(side, AVATAR_SIZE)
    const canvas = document.createElement('canvas')
    canvas.width = out
    canvas.height = out
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Przeglądarka nie obsługuje przetwarzania obrazów.')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, out, out)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Nie udało się przetworzyć zdjęcia.'))), 'image/jpeg', 0.88),
    )
  } finally {
    bitmap.close()
  }
}

/** Zdjęcie do odczytu przepisu przez AI: base64 bez prefiksu `data:` (format jak w api/_lib/gemini.ts) */
export interface ScanImage {
  mimeType: 'image/jpeg'
  data: string
}

/** Limit jednego zdjęcia po zakodowaniu (znaki base64) — serwer odrzuca większe (api/_lib/inputs.ts) */
const SCAN_MAX_BASE64_CHARS = 1_400_000

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Nie udało się przetworzyć zdjęcia.'))
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.readAsDataURL(blob)
  })
}

/**
 * Zrzut ekranu lub zdjęcie przepisu zmniejszone do czytelnego JPEG (dłuższy bok do 2000 px), żeby zmieściło się
 * w żądaniu. Tekst na zrzucie musi pozostać czytelny, więc zmniejszamy dopiero, gdy pierwsza próba jest za duża.
 */
export async function fileToScanImage(file: File): Promise<ScanImage> {
  if (!file.type.startsWith('image/')) throw new Error('Wybierz plik ze zdjęciem.')
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    for (const [maxSide, quality] of [[2000, 0.85], [1500, 0.75], [1100, 0.7]] as const) {
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(bitmap.width * scale)
      canvas.height = Math.round(bitmap.height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Przeglądarka nie obsługuje przetwarzania obrazów.')
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Nie udało się przetworzyć zdjęcia.'))), 'image/jpeg', quality),
      )
      const data = await blobToBase64(blob)
      if (data.length <= SCAN_MAX_BASE64_CHARS) return { mimeType: 'image/jpeg', data }
    }
    throw new Error('Zdjęcie jest zbyt duże. Spróbuj z mniejszym zrzutem ekranu.')
  } finally {
    bitmap.close()
  }
}

/** Zapisuje zdjęcie profilowe (folder użytkownika, plik „avatar-…”) */
export const uploadAvatarImage = (blob: Blob) => uploadRecipeImage(blob, 'avatar-')

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Nie udało się odczytać zdjęcia.'))
    reader.readAsDataURL(blob)
  })

/** Zapisuje zdjęcie i zwraca jego adres. `namePrefix` odróżnia rodzaj pliku w folderze użytkownika (np. „avatar-”). */
export async function uploadRecipeImage(blob: Blob, namePrefix = ''): Promise<string> {
  if (!supabase || !usesSupabase) return blobToDataUrl(blob) // tryb lokalny: obraz zostaje w przepisie jako data URL

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) throw new Error('Zaloguj się ponownie, żeby dodać zdjęcie.')
  const path = `${userData.user.id}/${namePrefix}${crypto.randomUUID()}.jpg`

  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' })
  if (error) throw new Error(`Nie udało się zapisać zdjęcia: ${error.message}`)
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

/** Usuwa zdjęcie z bazy, żeby nie zajmowało miejsca. Nic nie robi dla zdjęć spoza naszego bucketa. Nie rzuca. */
export async function deleteRecipeImage(url: string | undefined | null): Promise<void> {
  const path = storagePathFromUrl(url)
  if (!supabase || !usesSupabase || !path) return
  try {
    const { data: userData } = await supabase.auth.getUser()
    // Polityki Storage i tak dopuszczają tylko własny folder; sprawdzamy też tu, żeby nie słać pustych żądań
    if (!userData.user || !path.startsWith(`${userData.user.id}/`)) return
    const { error } = await supabase.storage.from(BUCKET).remove([path])
    if (error) console.warn('[images] nie udało się usunąć zdjęcia:', error.message)
  } catch (e) {
    console.warn('[images] nie udało się usunąć zdjęcia:', e)
  }
}
