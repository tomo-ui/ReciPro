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
