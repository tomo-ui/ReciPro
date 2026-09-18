import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { emptyDraft, type ParseOrigin, type RecipeDraft } from '@/types/recipe'
import { parseRecipeFromUrl } from '@/lib/parsing'
import { SegmentedControl } from '@/components/SegmentedControl'
import { LinkIcon, SpinnerIcon } from '@/components/Icons'

type Mode = 'link' | 'manual'

interface FormState {
  title: string
  description: string
  servings: string
  prep: string
  cook: string
  ingredients: string // jedna linia = jeden składnik
  steps: string // jedna linia = jeden krok
  tags: string // po przecinku
  source_url?: string
  parse_method: RecipeDraft['parse_method']
  image_url?: string
  /** Pola poniżej służą tylko do komunikatów w UI — nie zapisujemy ich w bazie */
  origin?: ParseOrigin
  /** Wartość porcji podana przez AI; komunikat znika, gdy użytkownik ją zmieni */
  estimatedServings?: number
  thumbnailFailed?: boolean
}

const IMPORT_NOTES: Record<RecipeDraft['parse_method'], string> = {
  manual: '',
  'json-ld': 'Zaimportowano z danych strukturalnych strony. Sprawdź i zapisz.',
  heuristic: 'Odczytano z treści strony — sprawdź składniki i kroki przed zapisem.',
  gemini: 'Odczytano przez AI — upewnij się, że wszystko się zgadza.',
}

const emptyForm = (): FormState => ({
  title: '',
  description: '',
  servings: '',
  prep: '',
  cook: '',
  ingredients: '',
  steps: '',
  tags: '',
  parse_method: 'manual',
})

const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean)
const num = (s: string) => {
  const n = parseInt(s, 10)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

function fromDraft(d: RecipeDraft): FormState {
  return {
    title: d.title,
    description: d.description ?? '',
    servings: d.servings?.toString() ?? '',
    prep: d.prep_minutes?.toString() ?? '',
    cook: d.cook_minutes?.toString() ?? '',
    ingredients: d.ingredients.map((i) => i.text).join('\n'),
    steps: d.steps.map((s) => s.text).join('\n'),
    tags: d.tags.join(', '),
    source_url: d.source_url,
    image_url: d.image_url,
    parse_method: d.parse_method,
  }
}

function toDraft(f: FormState): RecipeDraft {
  const prep = num(f.prep)
  const cook = num(f.cook)
  return {
    ...emptyDraft(),
    title: f.title.trim(),
    description: f.description.trim() || undefined,
    servings: num(f.servings),
    prep_minutes: prep,
    cook_minutes: cook,
    total_minutes: prep || cook ? (prep ?? 0) + (cook ?? 0) : undefined,
    ingredients: lines(f.ingredients).map((text) => ({ text })),
    steps: lines(f.steps).map((text) => ({ text })),
    tags: f.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
    source_url: f.source_url,
    image_url: f.image_url,
    parse_method: f.parse_method,
  }
}

interface Props {
  onClose: () => void
  onSave: (draft: RecipeDraft) => Promise<unknown>
}

export function AddRecipeScreen({ onClose, onSave }: Props) {
  const [mode, setMode] = useState<Mode>('link')
  const [form, setForm] = useState<FormState>(emptyForm)
  const [url, setUrl] = useState('')
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const canSave = form.title.trim().length > 0 && !saving

  async function fetchRecipe() {
    setError(null)
    setFetching(true)
    try {
      const { draft, origin, servingsEstimated, thumbnailFailed } = await parseRecipeFromUrl(url.trim())
      setForm({
        ...fromDraft({ ...draft, source_url: draft.source_url ?? url.trim() }),
        origin,
        estimatedServings: servingsEstimated ? draft.servings : undefined,
        thumbnailFailed,
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
      await onSave(toDraft(form))
      onClose()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Nie udało się zapisać przepisu.')
      setSaving(false)
    }
  }

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
        {saveError && (
          <p className="mb-3 rounded-[12px] bg-surface px-4 py-3 text-[14px] text-red-500">{saveError}</p>
        )}
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
                  Zawsze możesz poprawić wynik przed zapisem.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {form.parse_method !== 'manual' && (
                  <div className="space-y-1.5 rounded-[12px] bg-surface px-4 py-3 text-[14px] text-label-2">
                    <p>
                      {form.origin === 'tiktok-caption'
                        ? 'Przepis odczytany z opisu filmu na TikToku (samego wideo nie analizujemy). Sprawdź składniki i kroki — bywają niepełne.'
                        : IMPORT_NOTES[form.parse_method]}
                    </p>
                    {form.estimatedServings !== undefined && form.servings === String(form.estimatedServings) && (
                      <p>Liczba porcji ({form.estimatedServings}) to szacunek AI — źródło jej nie podawało. Popraw, jeśli się nie zgadza.</p>
                    )}
                    {form.thumbnailFailed && <p>Nie udało się zapisać miniaturki filmu — przepis zapiszesz bez zdjęcia.</p>}
                  </div>
                )}
                {form.image_url && (
                  <img
                    src={form.image_url}
                    alt=""
                    className="h-32 w-full rounded-[14px] object-cover"
                    draggable={false}
                    onError={(e) => (e.currentTarget.style.display = 'none')}
                  />
                )}
                <Group>
                  <Field label="Tytuł">
                    <input
                      value={form.title}
                      onChange={(e) => set('title', e.target.value)}
                      placeholder="Np. Zupa pomidorowa"
                      className="w-full bg-transparent text-right outline-none placeholder:text-label-3"
                    />
                  </Field>
                  <Field label="Porcje">
                    <NumberInput value={form.servings} onChange={(v) => set('servings', v)} />
                  </Field>
                  <Field label="Przygotowanie (min)">
                    <NumberInput value={form.prep} onChange={(v) => set('prep', v)} />
                  </Field>
                  <Field label="Gotowanie (min)">
                    <NumberInput value={form.cook} onChange={(v) => set('cook', v)} />
                  </Field>
                </Group>

                <TextBlock
                  header="Składniki"
                  footer="Jeden składnik w linii."
                  value={form.ingredients}
                  onChange={(v) => set('ingredients', v)}
                  placeholder={'200 g mąki\n2 jajka'}
                />
                <TextBlock
                  header="Przygotowanie"
                  footer="Jeden krok w linii."
                  value={form.steps}
                  onChange={(v) => set('steps', v)}
                  placeholder={'Wymieszaj składniki.\nPiecz 30 minut.'}
                />

                <Group>
                  <Field label="Tagi">
                    <input
                      value={form.tags}
                      onChange={(e) => set('tags', e.target.value)}
                      placeholder="deser, szybkie"
                      autoCapitalize="none"
                      className="w-full bg-transparent text-right outline-none placeholder:text-label-3"
                    />
                  </Field>
                </Group>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

/* — małe elementy formularza w stylu „inset grouped” — */

function Group({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-separator overflow-hidden rounded-[14px] bg-surface">{children}</div>
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center gap-4 px-4 py-3">
      <span className="shrink-0 text-[16px]">{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  )
}

function NumberInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      inputMode="numeric"
      pattern="[0-9]*"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
      placeholder="—"
      className="w-full bg-transparent text-right outline-none placeholder:text-label-3"
    />
  )
}

function TextBlock(props: {
  header: string
  footer: string
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <div>
      <p className="mb-1.5 px-4 text-[13px] text-label-2 uppercase">{props.header}</p>
      <Group>
        <textarea
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          placeholder={props.placeholder}
          rows={4}
          className="block min-h-28 w-full resize-none bg-transparent px-4 py-3 outline-none [field-sizing:content] placeholder:text-label-3"
        />
      </Group>
      <p className="mt-1.5 px-4 text-[13px] text-label-2">{props.footer}</p>
    </div>
  )
}
