import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { ParseOrigin, RecipeDraft, ThumbnailInfo } from '@/types/recipe'
import {
  ImportError,
  MAX_SCAN_IMAGES,
  MIN_PASTED_CHARS,
  parseRecipeFromImages,
  parseRecipeFromText,
  parseRecipeFromUrl,
  type ParseResult,
} from '@/lib/parsing'
import { draftToForm, emptyForm } from '@/lib/recipeForm'
import { useAiConsent } from '@/hooks/useAiConsent'
import { useRecipeForm } from '@/hooks/useRecipeForm'
import { AiConsentDialog } from '@/components/AiConsentDialog'
import { RecipeFields } from '@/components/RecipeFields'
import { Group } from '@/components/formParts'
import { SegmentedControl } from '@/components/SegmentedControl'
import { CameraIcon, LinkIcon, SpinnerIcon, XIcon } from '@/components/Icons'

type Mode = 'link' | 'text' | 'image' | 'manual'

/** Miniatury wybranych zrzutów ekranu (adresy tymczasowe zwalniamy przy usunięciu i zamknięciu) */
interface PickedImage {
  file: File
  url: string
}

/** Pozostałe źródła mają miniaturkę posta — tylko te dostają komunikat o jej braku/błędzie */
const SOCIAL_ORIGINS: ParseOrigin[] = ['tiktok-caption', 'instagram-caption', 'youtube-caption']

const IMPORT_NOTES: Record<RecipeDraft['parse_method'], string> = {
  manual: '',
  'json-ld': 'Zaimportowano z danych strukturalnych strony. Sprawdź i zapisz.',
  heuristic: 'Odczytano z treści strony — sprawdź składniki i kroki przed zapisem.',
  gemini: 'Odczytano przez AI — upewnij się, że wszystko się zgadza.',
}

/** Komunikat zależny od tego, skąd pochodzi import (opis posta albo strona z linku w opisie) */
const ORIGIN_NOTES: Partial<Record<ParseOrigin, string>> = {
  'tiktok-caption': 'Przepis odczytany z opisu filmu na TikToku (samego wideo nie analizujemy). Sprawdź składniki i kroki — bywają niepełne.',
  'instagram-caption': 'Przepis odczytany z opisu posta na Instagramie (samego wideo nie analizujemy). Sprawdź składniki i kroki — bywają niepełne.',
  'youtube-caption': 'Przepis odczytany z opisu filmu na YouTube (samego wideo nie analizujemy). Sprawdź składniki i kroki — bywają niepełne.',
  'post-link': 'W opisie posta był link do przepisu — odczytano go ze strony pod tym linkiem. Sprawdź składniki i kroki.',
  text: 'Przepis odczytany z wklejonego tekstu przez AI. Sprawdź składniki i kroki przed zapisem.',
  image: 'Przepis odczytany ze zdjęcia przez AI (zdjęcia nie są zapisywane). Sprawdź zwłaszcza ilości składników i kolejność kroków.',
}

/** Informacje o imporcie pokazywane nad formularzem (nie trafiają do bazy) */
interface ImportInfo {
  origin: ParseOrigin
  method: RecipeDraft['parse_method']
  /** Porcje podane przez AI; komunikat znika, gdy użytkownik zmieni wartość */
  estimatedServings?: number
  /** Skąd wzięła się liczba porcji */
  servingsBasis?: string
  thumbnail: ThumbnailInfo
}

interface Props {
  onClose: () => void
  onSave: (draft: RecipeDraft) => Promise<unknown>
}

export function AddRecipeScreen({ onClose, onSave }: Props) {
  const rf = useRecipeForm(emptyForm())
  const { form } = rf
  const [mode, setMode] = useState<Mode>('link')
  const [url, setUrl] = useState('')
  const [pastedText, setPastedText] = useState('')
  const [picked, setPicked] = useState<PickedImage[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<ImportInfo | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  // Zgoda na AI przed pierwszym importem; `pendingImport` to importowanie wstrzymane do czasu decyzji
  const consent = useAiConsent()
  const [pendingImport, setPendingImport] = useState<(() => void) | null>(null)

  const canSave = form.title.trim().length > 0 && !saving && !rf.imageBusy

  // Zwolnienie adresów podglądu zrzutów po zamknięciu ekranu
  const pickedRef = useRef<PickedImage[]>([])
  pickedRef.current = picked
  useEffect(() => () => pickedRef.current.forEach((p) => URL.revokeObjectURL(p.url)), [])

  function addImages(list: FileList | null) {
    if (!list) return
    const room = MAX_SCAN_IMAGES - picked.length
    const files = [...list].filter((f) => f.type.startsWith('image/')).slice(0, Math.max(0, room))
    if (files.length === 0) return
    setError(null)
    setPicked((old) => [...old, ...files.map((file) => ({ file, url: URL.createObjectURL(file) }))])
  }

  function removeImage(index: number) {
    setPicked((old) => {
      URL.revokeObjectURL(old[index].url)
      return old.filter((_, i) => i !== index)
    })
  }

  async function runImport(read: () => Promise<ParseResult>, sourceUrl?: string) {
    setError(null)
    setFetching(true)
    try {
      const { draft, origin, servingsEstimated, servingsBasis, thumbnail } = await read()
      // Import jest domyślnie prywatny (tylko Twoja książka): publikacja cudzego przepisu wymaga świadomej decyzji (RecipeFields)
      rf.load({ ...draftToForm({ ...draft, source_url: draft.source_url ?? sourceUrl }), is_post: false })
      setInfo({
        origin,
        method: draft.parse_method,
        estimatedServings: servingsEstimated ? draft.servings : undefined,
        servingsBasis: servingsEstimated ? servingsBasis : undefined,
        thumbnail,
      })
      setMode('manual') // użytkownik weryfikuje wynik parsowania przed zapisem
    } catch (e) {
      if (e instanceof ImportError && e.code === 'consent_required') {
        // Serwer nie ma zapisanej zgody (np. cofnięta na innym urządzeniu) — pytamy ponownie i ponawiamy import
        consent.markMissing()
        setPendingImport(() => () => void runImport(read, sourceUrl))
      } else {
        setError(e instanceof Error ? e.message : 'Nie udało się pobrać przepisu.')
      }
    } finally {
      setFetching(false)
    }
  }

  /** Import wymaga zgody na AI: bez niej najpierw pokazujemy okno zgody, a import rusza po „Zgadzam się” */
  function guardedImport(read: () => Promise<ParseResult>, sourceUrl?: string) {
    if (consent.granted) void runImport(read, sourceUrl)
    else setPendingImport(() => () => void runImport(read, sourceUrl))
  }

  async function save() {
    if (!canSave) return
    setSaving(true)
    setSaveError(null)
    try {
      const { draft, commit, rollback } = await rf.prepare()
      try {
        await onSave(draft)
      } catch (e) {
        await rollback() // nie zostawiamy w Storage zdjęcia bez przepisu
        throw e
      }
      await commit()
      onClose()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Nie udało się zapisać przepisu.')
      setSaving(false)
    }
  }

  const notes = info && (
    <div className="space-y-1.5 rounded-[12px] bg-surface px-4 py-3 text-[14px] text-label-2">
      <p>{ORIGIN_NOTES[info.origin] ?? IMPORT_NOTES[info.method]}</p>
      <p>Import trafia domyślnie do Twojej prywatnej książki kucharskiej. Okładka pochodzi z oryginalnego posta lub strony — zanim opublikujesz przepis, upewnij się, że możesz jej użyć, albo zmień ją na własne zdjęcie.</p>
      {info.estimatedServings !== undefined && form.servings === String(info.estimatedServings) && (
        <p>
          Liczba porcji ({info.estimatedServings}) to szacunek — źródło jej nie podawało
          {info.servingsBasis ? ` (${info.servingsBasis})` : ''}. Popraw, jeśli się nie zgadza.
        </p>
      )}
      {info.thumbnail.status === 'failed' && (
        <p>Nie udało się zapisać miniaturki filmu ({info.thumbnail.reason ?? 'nieznany powód'}). Możesz dodać własne zdjęcie.</p>
      )}
      {info.thumbnail.status === 'none' && SOCIAL_ORIGINS.includes(info.origin) && <p>Ten post nie udostępnia miniaturki.</p>}
    </div>
  )

  const importButton = (disabled: boolean, busyLabel: string, label: string, onClick: () => void) => (
    <motion.button
      whileTap={{ scale: 0.97 }}
      disabled={disabled || fetching}
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-accent py-3.5 text-[16px] font-semibold text-white transition-opacity disabled:opacity-40"
    >
      {fetching && <SpinnerIcon />}
      {fetching ? busyLabel : label}
    </motion.button>
  )

  const errorBlock = (
    <AnimatePresence>
      {error && (
        <motion.p
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="overflow-hidden px-1 text-[14px] text-red-500"
        >
          {error}
        </motion.p>
      )}
    </AnimatePresence>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-11 shrink-0 items-center justify-between px-4">
        <button onClick={onClose} className="text-[17px] text-accent active:opacity-50">
          Anuluj
        </button>
        <h2 className="text-[17px] font-semibold">Nowy przepis</h2>
        <button
          onClick={save}
          disabled={!canSave}
          className="text-[17px] font-semibold text-accent transition-opacity active:opacity-50 disabled:opacity-35"
        >
          Zapisz
        </button>
      </header>

      <div className="scroll-y flex-1 px-4 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+32px)]">
        {saveError && <p className="mb-3 rounded-[12px] bg-surface px-4 py-3 text-[14px] text-red-500">{saveError}</p>}
        <SegmentedControl<Mode>
          value={mode}
          onChange={(m) => {
            setError(null) // błąd importu dotyczy zakładki, w której wystąpił
            setMode(m)
          }}
          options={[
            { value: 'link', label: 'Link' },
            { value: 'text', label: 'Tekst' },
            { value: 'image', label: 'Zdjęcie' },
            { value: 'manual', label: 'Ręcznie' },
          ]}
        />

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={mode}
            initial={{ opacity: 0, x: mode === 'link' ? -16 : 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: mode === 'link' ? 16 : -16 }}
            transition={{ duration: 0.16 }}
            className="pt-5"
          >
            {mode === 'link' ? (
              <div className="space-y-3">
                <Group>
                  <div className="flex items-center gap-2 px-4 py-3">
                    <LinkIcon width={18} height={18} className="shrink-0 text-label-2" />
                    <input
                      type="url"
                      inputMode="url"
                      autoCapitalize="none"
                      autoCorrect="off"
                      placeholder="https://…"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-label-3"
                    />
                  </div>
                </Group>

                {importButton(!url.trim(), 'Pobieram…', 'Pobierz przepis', () => guardedImport(() => parseRecipeFromUrl(url.trim()), url.trim()))}
                {errorBlock}

                <p className="px-1 pt-1 text-[13px] text-label-2">
                  Wklej link do przepisu albo do posta z Instagrama, filmu z YouTube lub TikToka — w drugim przypadku odczytamy
                  przepis z opisu, a gdy opis zawiera link do przepisu, ze strony pod tym linkiem. Aplikacja w razie potrzeby użyje AI.
                </p>
              </div>
            ) : mode === 'text' ? (
              <div className="space-y-3">
                <Group>
                  <textarea
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder="Wklej tutaj cały przepis — składniki i sposób przygotowania…"
                    rows={9}
                    className="block min-h-48 w-full resize-none bg-transparent px-4 py-3 leading-snug outline-none placeholder:text-label-3"
                  />
                </Group>

                {importButton(pastedText.trim().length < MIN_PASTED_CHARS, 'Odczytuję…', 'Odczytaj przepis', () => guardedImport(() => parseRecipeFromText(pastedText.trim())))}
                {errorBlock}

                <p className="px-1 pt-1 text-[13px] text-label-2">
                  Skopiuj przepis z dowolnej aplikacji, wiadomości lub strony i wklej go w całości — AI rozdzieli składniki, kroki, czas i porcje.
                  Przed zapisem zawsze możesz wszystko poprawić.
                </p>
              </div>
            ) : mode === 'image' ? (
              <div className="space-y-3">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    addImages(e.target.files)
                    e.target.value = '' // pozwala wybrać ten sam plik ponownie po usunięciu
                  }}
                />
                {picked.length > 0 && (
                  <div className="grid grid-cols-4 gap-2">
                    {picked.map((p, i) => (
                      <div key={p.url} className="relative aspect-[3/4] overflow-hidden rounded-[10px] bg-surface">
                        <img src={p.url} alt={`Zdjęcie ${i + 1}`} className="h-full w-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeImage(i)}
                          aria-label={`Usuń zdjęcie ${i + 1}`}
                          className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white"
                        >
                          <XIcon width={14} height={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {picked.length < MAX_SCAN_IMAGES && (
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.98 }}
                    onClick={() => fileRef.current?.click()}
                    className="flex w-full flex-col items-center gap-2 rounded-[14px] border-[1.5px] border-dashed border-label-3 py-8 text-label-2"
                  >
                    <CameraIcon width={28} height={28} />
                    <span className="text-[15px] font-medium">{picked.length === 0 ? 'Wybierz zrzut ekranu lub zdjęcie' : 'Dodaj kolejne zdjęcie'}</span>
                  </motion.button>
                )}

                {importButton(picked.length === 0, 'Odczytuję…', 'Odczytaj przepis', () => guardedImport(() => parseRecipeFromImages(picked.map((p) => p.file))))}
                {errorBlock}

                <p className="px-1 pt-1 text-[13px] text-label-2">
                  Zrzut ekranu albo zdjęcie przepisu (np. z książki). Możesz dodać do {MAX_SCAN_IMAGES} zdjęć, jeśli przepis jest długi i
                  podzielony na części. Zdjęcia są używane tylko do odczytu i nie są zapisywane.
                </p>
              </div>
            ) : (
              <RecipeFields
                form={form}
                set={rf.set}
                imageSrc={rf.imageSrc}
                imageBusy={rf.imageBusy}
                imageError={rf.imageError}
                onPickImage={rf.pickImage}
                onRemoveImage={rf.removeImage}
                notes={notes}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {pendingImport && (
        <AiConsentDialog
          onAccept={async () => {
            await consent.set(true)
            const go = pendingImport
            setPendingImport(null)
            go()
          }}
          onDecline={() => setPendingImport(null)}
        />
      )}
    </div>
  )
}
