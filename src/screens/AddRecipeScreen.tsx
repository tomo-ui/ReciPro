import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { ParseOrigin, RecipeDraft, ThumbnailInfo } from '@/types/recipe'
import { parseRecipeFromUrl } from '@/lib/parsing'
import { draftToForm, emptyForm } from '@/lib/recipeForm'
import { useRecipeForm } from '@/hooks/useRecipeForm'
import { RecipeFields } from '@/components/RecipeFields'
import { Group } from '@/components/formParts'
import { SegmentedControl } from '@/components/SegmentedControl'
import { LinkIcon, SpinnerIcon } from '@/components/Icons'

type Mode = 'link' | 'manual'

const IMPORT_NOTES: Record<RecipeDraft['parse_method'], string> = {
  manual: '',
  'json-ld': 'Zaimportowano z danych strukturalnych strony. Sprawdź i zapisz.',
  heuristic: 'Odczytano z treści strony — sprawdź składniki i kroki przed zapisem.',
  gemini: 'Odczytano przez AI — upewnij się, że wszystko się zgadza.',
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
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<ImportInfo | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const canSave = form.title.trim().length > 0 && !saving && !rf.imageBusy

  async function fetchRecipe() {
    setError(null)
    setFetching(true)
    try {
      const { draft, origin, servingsEstimated, servingsBasis, thumbnail } = await parseRecipeFromUrl(url.trim())
      rf.load(draftToForm({ ...draft, source_url: draft.source_url ?? url.trim() }))
      setInfo({
        origin,
        method: draft.parse_method,
        estimatedServings: servingsEstimated ? draft.servings : undefined,
        servingsBasis: servingsEstimated ? servingsBasis : undefined,
        thumbnail,
      })
      setMode('manual') // użytkownik weryfikuje wynik parsowania przed zapisem
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się pobrać przepisu.')
    } finally {
      setFetching(false)
    }
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
      <p>
        {info.origin === 'tiktok-caption'
          ? 'Przepis odczytany z opisu filmu na TikToku (samego wideo nie analizujemy). Sprawdź składniki i kroki — bywają niepełne.'
          : IMPORT_NOTES[info.method]}
      </p>
      {info.estimatedServings !== undefined && form.servings === String(info.estimatedServings) && (
        <p>
          Liczba porcji ({info.estimatedServings}) to szacunek — źródło jej nie podawało
          {info.servingsBasis ? ` (${info.servingsBasis})` : ''}. Popraw, jeśli się nie zgadza.
        </p>
      )}
      {info.thumbnail.status === 'failed' && (
        <p>Nie udało się zapisać miniaturki filmu ({info.thumbnail.reason ?? 'nieznany powód'}). Możesz dodać własne zdjęcie.</p>
      )}
      {info.thumbnail.status === 'none' && info.origin === 'tiktok-caption' && <p>Ten film nie udostępnia miniaturki.</p>}
    </div>
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
          onChange={setMode}
          options={[
            { value: 'link', label: 'Z linku' },
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

                <motion.button
                  whileTap={{ scale: 0.97 }}
                  disabled={!url.trim() || fetching}
                  onClick={fetchRecipe}
                  className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-accent py-3.5 text-[16px] font-semibold text-white transition-opacity disabled:opacity-40"
                >
                  {fetching && <SpinnerIcon />}
                  {fetching ? 'Pobieram…' : 'Pobierz przepis'}
                </motion.button>

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

                <p className="px-1 pt-1 text-[13px] text-label-2">
                  Wklej link do przepisu albo do filmu z TikToka — w drugim przypadku odczytamy przepis z opisu filmu.
                  Aplikacja w razie potrzeby użyje AI.
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
    </div>
  )
}
