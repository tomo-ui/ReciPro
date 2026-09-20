import { useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import type { Recipe, RecipeDraft } from '@/types/recipe'
import { adaptRecipe, type AdaptMode } from '@/lib/adapt'
import { IDX, formatAmount, saltGrams } from '@/lib/nutrients'
import { PRESETS, mealTarget, type MacroPreset } from '@/lib/prefs'
import { useFoodDb } from '@/hooks/useFoodDb'
import { usePrefs } from '@/hooks/usePrefs'
import { CheckIcon, MinusIcon, PlusIcon, SpinnerIcon } from './Icons'
import { SegmentedControl } from './SegmentedControl'
import { Sheet } from './Sheet'
import { Toggle } from './formParts'

interface Props {
  recipe: Recipe
  onClose: () => void
  onSaveCopy?: (draft: RecipeDraft) => Promise<void>
}

const PRESET_KEYS = Object.keys(PRESETS) as Exclude<MacroPreset, 'custom'>[]

/**
 * Dopasowanie przepisu do moich celów: kalorie i proporcje makro na jeden posiłek.
 * Wynik to nowe gramatury składników (do zapisania jako osobny przepis), policzone lokalnie z bazy składników.
 */
export function AdaptSheet({ recipe, onClose, onSaveCopy }: Props) {
  const db = useFoodDb()
  const { prefs, update } = usePrefs()
  const [mode, setMode] = useState<AdaptMode>('macros')
  // Pole kalorii ma własny tekst, żeby wpisywanie „2500” nie skakało do minimum po pierwszej cyfrze
  const [kcalText, setKcalText] = useState(String(prefs.kcalPerDay))
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState<string | null>(null)

  const target = mealTarget(prefs)
  const result = useMemo(
    () =>
      db
        ? adaptRecipe(recipe.ingredients, recipe.servings, db, target, { mode, lowSalt: prefs.lowSalt, highFiber: prefs.highFiber })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, recipe.ingredients, recipe.servings, mode, prefs.kcalPerDay, prefs.mealsPerDay, prefs.protein, prefs.fat, prefs.carbs, prefs.lowSalt, prefs.highFiber],
  )

  async function save() {
    if (!result || !onSaveCopy || saveState !== 'idle') return
    setSaveState('saving')
    setError(null)
    try {
      const draft: RecipeDraft = {
        title: `${recipe.title} (dopasowany)`,
        description: recipe.description,
        // zdjęcie zostaje przy oryginale: usunięcie któregoś z przepisów kasuje plik ze Storage
        image_url: undefined,
        source_url: recipe.source_url,
        servings: recipe.servings,
        prep_minutes: recipe.prep_minutes,
        cook_minutes: recipe.cook_minutes,
        total_minutes: recipe.total_minutes,
        ingredients: result.ingredients,
        steps: recipe.steps,
        tags: recipe.tags,
        parse_method: 'manual',
      }
      await onSaveCopy(draft)
      setSaveState('saved')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się zapisać przepisu.')
      setSaveState('idle')
    }
  }

  return createPortal(
    <Sheet onClose={onClose}>
      <header className="flex h-11 shrink-0 items-center justify-between px-4">
        <button onClick={onClose} className="text-[17px] text-accent active:opacity-50">
          Zamknij
        </button>
        <h2 className="text-[17px] font-semibold">Dostosuj do celów</h2>
        <span className="w-14" />
      </header>

      <div className="scroll-y flex-1 space-y-5 px-4 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+32px)]">
        <section>
          <p className="mb-1.5 px-1 text-[13px] text-label-2 uppercase">Moje cele</p>
          <div className="divide-y divide-separator overflow-hidden rounded-[14px] bg-surface">
            <Line label="Kalorie dziennie">
              <input
                value={kcalText}
                inputMode="numeric"
                aria-label="Kalorie dziennie"
                onChange={(e) => {
                  const text = e.target.value.replace(/\D/g, '').slice(0, 4)
                  setKcalText(text)
                  const n = parseInt(text, 10)
                  if (n >= 800) update({ kcalPerDay: n })
                }}
                onBlur={() => setKcalText(String(prefs.kcalPerDay))}
                className="w-24 bg-transparent text-right outline-none"
              />
              <span className="ml-1 text-label-2">kcal</span>
            </Line>
            <Line label="Posiłków dziennie">
              <StepButton label="Mniej posiłków" onClick={() => update({ mealsPerDay: prefs.mealsPerDay - 1 })}>
                <MinusIcon width={16} height={16} />
              </StepButton>
              <span className="w-8 text-center font-semibold tabular-nums">{prefs.mealsPerDay}</span>
              <StepButton label="Więcej posiłków" onClick={() => update({ mealsPerDay: prefs.mealsPerDay + 1 })}>
                <PlusIcon width={16} height={16} />
              </StepButton>
            </Line>
            <div className="px-4 py-3">
              <p className="mb-2 text-[16px]">Proporcje makroskładników</p>
              <div className="flex flex-wrap gap-2">
                {PRESET_KEYS.map((k) => (
                  <button
                    key={k}
                    onClick={() => update({ preset: k })}
                    className={`rounded-full px-3.5 py-1.5 text-[14px] ${prefs.preset === k ? 'bg-accent text-white' : 'bg-surface-2'}`}
                  >
                    {PRESETS[k].label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[12px] text-label-2">
                Białko {prefs.protein}% · tłuszcz {prefs.fat}% · węglowodany {prefs.carbs}% kalorii
              </p>
            </div>
            <Line label="Mniej soli">
              <Toggle checked={prefs.lowSalt} onChange={(v) => update({ lowSalt: v })} label="Mniej soli" />
            </Line>
            <Line label="Więcej błonnika">
              <Toggle checked={prefs.highFiber} onChange={(v) => update({ highFiber: v })} label="Więcej błonnika" />
            </Line>
          </div>
          <p className="mt-1.5 px-1 text-[12px] text-label-2">
            Cel na jeden posiłek: {Math.round(target.kcal)} kcal · B {Math.round(target.protein)} g · T {Math.round(target.fat)} g · W {Math.round(target.carbs)} g.
            Ustawienia zostają na tym urządzeniu.
          </p>
        </section>

        {!db || !result ? (
          <div className="flex justify-center py-8 text-label-2">
            <SpinnerIcon width={24} height={24} />
          </div>
        ) : (
          <>
            <section>
              <SegmentedControl<AdaptMode>
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'macros', label: 'Zmień składniki' },
                  { value: 'kcal', label: 'Skaluj porcję' },
                ]}
              />
              <p className="mt-2 px-1 text-[12px] text-label-2">
                {mode === 'macros'
                  ? 'Zmienia gramatury składników w g i ml (±40–60%), żeby zbliżyć się do kalorii i proporcji makro. Sztuki, przyprawy i sól zostają.'
                  : 'Wszystkie składniki są zmniejszane lub zwiększane jednakowo, żeby porcja miała docelową liczbę kalorii.'}
              </p>
            </section>

            {result.problem ? (
              <p className="rounded-[14px] bg-surface p-4 text-[14px] text-label-2">{result.problem}</p>
            ) : (
              <>
                <section>
                  <p className="mb-1.5 px-1 text-[13px] text-label-2 uppercase">Na porcję: teraz → po zmianach → cel</p>
                  <div className="divide-y divide-separator overflow-hidden rounded-[14px] bg-surface text-[15px]">
                    <Compare label="Kalorie" unit="kcal" before={result.before[IDX.kcal]} after={result.after[IDX.kcal]} goal={target.kcal} />
                    <Compare label="Białko" unit="g" before={result.before[IDX.protein]} after={result.after[IDX.protein]} goal={target.protein} />
                    <Compare label="Tłuszcz" unit="g" before={result.before[IDX.fat]} after={result.after[IDX.fat]} goal={target.fat} />
                    <Compare label="Węglowodany" unit="g" before={result.before[IDX.carbs]} after={result.after[IDX.carbs]} goal={target.carbs} />
                    <Compare label="Błonnik" unit="g" before={result.before[IDX.fiber]} after={result.after[IDX.fiber]} />
                    <Compare
                      label="Sól"
                      unit="g"
                      before={saltGrams(result.before[IDX.sodium])}
                      after={saltGrams(result.after[IDX.sodium])}
                      digits
                    />
                  </div>
                  <p className={`mt-1.5 px-1 text-[12px] ${result.reached ? 'text-green-600' : 'text-label-2'}`}>
                    {result.reached
                      ? 'Porcja mieści się w Twoim celu.'
                      : 'Nie da się trafić dokładnie w cel przy tych składnikach — to najbliższy możliwy wynik.'}
                  </p>
                </section>

                <section>
                  <p className="mb-1.5 px-1 text-[13px] text-label-2 uppercase">
                    {result.changes.length > 0 ? `Zmiany w składnikach (${result.changes.length})` : 'Składniki'}
                  </p>
                  {result.changes.length === 0 ? (
                    <p className="rounded-[14px] bg-surface p-4 text-[14px] text-label-2">Ten przepis już odpowiada Twojemu celowi — nic nie trzeba zmieniać.</p>
                  ) : (
                    <ul className="divide-y divide-separator overflow-hidden rounded-[14px] bg-surface text-[14px]">
                      {result.changes.map((c) => (
                        <li key={c.index} className="px-4 py-2.5">
                          <p className="text-label-2 line-through">{c.from}</p>
                          <p className="font-semibold">{c.to}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {onSaveCopy && result.changes.length > 0 && (
                  <section>
                    {error && <p className="mb-2 rounded-[12px] bg-surface px-4 py-3 text-[14px] text-red-500">{error}</p>}
                    <motion.button
                      whileTap={{ scale: 0.98 }}
                      onClick={save}
                      disabled={saveState !== 'idle'}
                      className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-accent py-3.5 text-[16px] font-semibold text-white disabled:opacity-60"
                    >
                      {saveState === 'saving' && <SpinnerIcon width={18} height={18} />}
                      {saveState === 'saved' && <CheckIcon width={18} height={18} />}
                      {saveState === 'saved' ? 'Zapisano w Twoich przepisach' : 'Zapisz jako nowy przepis'}
                    </motion.button>
                    <p className="mt-1.5 px-1 text-[12px] text-label-2">Oryginał zostaje bez zmian. Kopia nie dostaje zdjęcia z oryginału.</p>
                  </section>
                )}
              </>
            )}
          </>
        )}
      </div>
    </Sheet>,
    document.body,
  )
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-[16px]">
      <span>{label}</span>
      <span className="flex items-center gap-2">{children}</span>
    </div>
  )
}

function StepButton({ children, label, onClick }: { children: ReactNode; label: string; onClick: () => void }) {
  return (
    <motion.button
      whileTap={{ scale: 0.88 }}
      onClick={onClick}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-white"
    >
      {children}
    </motion.button>
  )
}

function Compare({ label, unit, before, after, goal, digits }: { label: string; unit: string; before: number; after: number; goal?: number; digits?: boolean }) {
  const fmt = (v: number) => (digits ? v.toFixed(1).replace('.', ',') : formatAmount(v))
  const off = goal !== undefined && goal > 0 ? Math.abs(after - goal) / goal : 0
  const tone = goal === undefined ? '' : off <= 0.1 ? 'text-green-600' : off <= 0.25 ? 'text-amber-500' : 'text-red-500'
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 py-2.5">
      <span>{label}</span>
      <span className="text-right tabular-nums">
        <span className="text-label-2">{fmt(before)}</span>
        <span className="mx-1.5 text-label-3">→</span>
        <span className={`font-semibold ${tone}`}>{fmt(after)}</span>
        {goal !== undefined && <span className="ml-1.5 text-[13px] text-label-2">/ {formatAmount(goal)}</span>}
        <span className="ml-1 text-[12px] text-label-2">{unit}</span>
      </span>
    </div>
  )
}
