import { useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import type { IngredientLine } from '@/types/recipe'
import { adaptRecipe, type AdaptMode } from '@/lib/adapt'
import { IDX, formatAmount, saltGrams } from '@/lib/nutrients'
import type { MealTarget } from '@/lib/prefs'
import { useFoodDb } from '@/hooks/useFoodDb'
import { CheckIcon, SpinnerIcon } from './Icons'
import { SegmentedControl } from './SegmentedControl'
import { Sheet } from './Sheet'

interface Props {
  title?: string
  ingredients: IngredientLine[]
  /** Na ile porcji jest ta lista składników (1 = składniki jednej porcji) */
  servings?: number
  /** Cel na jedną porcję */
  target: MealTarget
  lowSalt?: boolean
  highFiber?: boolean
  /** Miejsce nad wynikiem, np. edytor celów */
  header?: ReactNode
  applyLabel: string
  appliedLabel: string
  /** Krótka uwaga pod przyciskiem */
  footnote?: string
  /** Zapisuje wynik (nowe linie składników) */
  onApply: (lines: IngredientLine[]) => Promise<void> | void
  onClose: () => void
}

/**
 * Dopasowanie listy składników do celu na porcję: kalorie i proporcje makro (opcjonalnie mniej soli, więcej błonnika).
 * Liczy lokalnie z bazy składników; pokazuje „teraz → po zmianach → cel” i listę zmian, a zapis zostawia wywołującemu.
 */
export function AdaptSheet({ title = 'Dostosuj do celów', ingredients, servings, target, lowSalt, highFiber, header, applyLabel, appliedLabel, footnote, onApply, onClose }: Props) {
  const db = useFoodDb()
  const [mode, setMode] = useState<AdaptMode>('macros')
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState<string | null>(null)

  const result = useMemo(
    () => (db ? adaptRecipe(ingredients, servings, db, target, { mode, lowSalt, highFiber }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, ingredients, servings, mode, target.kcal, target.protein, target.fat, target.carbs, lowSalt, highFiber],
  )

  async function apply() {
    if (!result || state !== 'idle') return
    setState('saving')
    setError(null)
    try {
      await onApply(result.ingredients)
      setState('saved')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się zapisać zmian.')
      setState('idle')
    }
  }

  return createPortal(
    <Sheet onClose={onClose}>
      <header className="flex h-11 shrink-0 items-center justify-between px-4">
        <button onClick={onClose} className="text-[17px] text-accent active:opacity-50">
          Zamknij
        </button>
        <h2 className="text-[17px] font-semibold">{title}</h2>
        <span className="w-14" />
      </header>

      <div className="scroll-y flex-1 space-y-5 px-4 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+32px)]">
        {header}

        <p className="px-1 text-[13px] text-label-2">
          Cel na porcję: {Math.round(target.kcal)} kcal · B {Math.round(target.protein)} g · T {Math.round(target.fat)} g · W {Math.round(target.carbs)} g
        </p>

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
                    <Compare label="Sól" unit="g" before={saltGrams(result.before[IDX.sodium])} after={saltGrams(result.after[IDX.sodium])} digits />
                  </div>
                  <p className={`mt-1.5 px-1 text-[12px] ${result.reached ? 'text-green-600' : 'text-label-2'}`}>
                    {result.reached ? 'Porcja mieści się w celu.' : 'Nie da się trafić dokładnie w cel przy tych składnikach — to najbliższy możliwy wynik.'}
                  </p>
                </section>

                <section>
                  <p className="mb-1.5 px-1 text-[13px] text-label-2 uppercase">
                    {result.changes.length > 0 ? `Zmiany w składnikach (${result.changes.length})` : 'Składniki'}
                  </p>
                  {result.changes.length === 0 ? (
                    <p className="rounded-[14px] bg-surface p-4 text-[14px] text-label-2">To danie już odpowiada celowi — nic nie trzeba zmieniać.</p>
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

                {result.changes.length > 0 && (
                  <section>
                    {error && <p className="mb-2 rounded-[12px] bg-surface px-4 py-3 text-[14px] text-red-500">{error}</p>}
                    <motion.button
                      whileTap={{ scale: 0.98 }}
                      onClick={apply}
                      disabled={state !== 'idle'}
                      className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-accent py-3.5 text-[16px] font-semibold text-white disabled:opacity-60"
                    >
                      {state === 'saving' && <SpinnerIcon width={18} height={18} />}
                      {state === 'saved' && <CheckIcon width={18} height={18} />}
                      {state === 'saved' ? appliedLabel : applyLabel}
                    </motion.button>
                    {footnote && <p className="mt-1.5 px-1 text-[12px] text-label-2">{footnote}</p>}
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
