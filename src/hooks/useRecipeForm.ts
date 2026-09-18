import { useCallback, useEffect, useRef, useState } from 'react'
import type { RecipeDraft } from '@/types/recipe'
import { deleteRecipeImage, fileToCoverBlob, uploadRecipeImage } from '@/lib/images'
import { formToDraft, type FormState } from '@/lib/recipeForm'

const MAX_FILE_BYTES = 20 * 1024 * 1024

/**
 * Stan formularza przepisu razem z zarządzaniem zdjęciem tak, żeby nic nie zostawało w Storage:
 *  • wybrane zdjęcie jest tylko w pamięci (przycięte do 4:3) i wysyłane dopiero przy zapisie,
 *  • po zapisie znika zdjęcie, które zostało zastąpione albo usunięte (także to z importu),
 *  • gdy zapis się nie uda, świeżo wysłane zdjęcie jest wycofywane,
 *  • porzucony import (zamknięcie formularza bez zapisu) kasuje zdjęcie zapisane przez serwer.
 */
export function useRecipeForm(initial: FormState) {
  const [form, setForm] = useState<FormState>(initial)
  const [pending, setPending] = useState<{ blob: Blob; preview: string } | null>(null)
  const [imageBusy, setImageBusy] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)

  /** Adres zapisany w przepisie przed edycją */
  const originalImage = useRef(initial.image_url)
  /** Adres zapisany przez serwer podczas importu, jeszcze niepowiązany z zapisanym przepisem */
  const sessionImage = useRef<string | undefined>(undefined)
  const saved = useRef(false)
  const previewRef = useRef<string | null>(null)
  previewRef.current = pending?.preview ?? null

  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current)
      if (!saved.current && sessionImage.current) void deleteRecipeImage(sessionImage.current)
    },
    [],
  )

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value })), [])

  /** Wynik importu z linku: zastępuje pola, a zdjęcie z poprzedniego importu (niezapisane) kasuje */
  const load = useCallback((next: FormState) => {
    if (sessionImage.current && sessionImage.current !== next.image_url) void deleteRecipeImage(sessionImage.current)
    sessionImage.current = next.image_url
    setPending(null)
    setForm(next)
  }, [])

  const pickImage = useCallback(async (file: File) => {
    setImageError(null)
    if (!file.type.startsWith('image/')) return setImageError('Wybierz plik ze zdjęciem.')
    if (file.size > MAX_FILE_BYTES) return setImageError('Zdjęcie jest zbyt duże (maks. 20 MB).')
    setImageBusy(true)
    try {
      const blob = await fileToCoverBlob(file)
      setPending((old) => {
        if (old) URL.revokeObjectURL(old.preview)
        return { blob, preview: URL.createObjectURL(blob) }
      })
    } catch (e) {
      setImageError(e instanceof Error ? e.message : 'Nie udało się przetworzyć zdjęcia.')
    } finally {
      setImageBusy(false)
    }
  }, [])

  const removeImage = useCallback(() => {
    setPending((old) => {
      if (old) URL.revokeObjectURL(old.preview)
      return null
    })
    setForm((f) => ({ ...f, image_url: undefined }))
  }, [])

  /**
   * Buduje szkic do zapisu (wysyłając wybrane zdjęcie) i zwraca `commit` / `rollback`,
   * które trzeba wywołać po skutecznym / nieudanym zapisie przepisu.
   */
  const prepare = useCallback(async () => {
    let uploaded: string | undefined
    let imageUrl = form.image_url
    if (pending) {
      uploaded = await uploadRecipeImage(pending.blob)
      imageUrl = uploaded
    }
    const draft: RecipeDraft = formToDraft({ ...form, image_url: imageUrl })
    return {
      draft,
      commit: async () => {
        saved.current = true
        for (const old of new Set([originalImage.current, sessionImage.current])) {
          if (old && old !== imageUrl) await deleteRecipeImage(old) // zastąpione lub usunięte zdjęcie
        }
      },
      rollback: async () => {
        if (uploaded) await deleteRecipeImage(uploaded)
      },
    }
  }, [form, pending])

  return {
    form,
    set,
    load,
    imageSrc: pending?.preview ?? form.image_url,
    imageBusy,
    imageError,
    pickImage,
    removeImage,
    prepare,
  }
}
