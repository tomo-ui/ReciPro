import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import type { DietItem } from '@/types/diet'
import { withLineAmount, withPortions } from '@/lib/diet'
import { IDX, formatAmount, type Nutrients } from '@/lib/nutrients'
import { analyzeRecipe } from '@/lib/nutrition'
import type { MealTarget } from '@/lib/prefs'
import { parseIngredient } from '@/lib/ingredients'
import { useFoodDb } from '@/hooks/useFoodDb'
import { AdaptSheet } from './AdaptSheet'
import { gramStep } from './FoodPicker'
import { MinusIcon, PlusIcon, SlidersIcon, SpinnerIcon, TrashIcon } from './Icons'
import { NutritionSummary } from './NutritionSummary'
import { Sheet } from './Sheet'

interface Props {
  item: DietItem
  /** Cel całego posiłku, do którego należy danie */
  mealTarget: MealTarget
  /** Wartości pozostałych dań w tym posiłku (bez tego dania) */
  others: Nutrients
  lowSalt: boolean
  highFiber: boolean
  readOnly?: boolean
  onChange: (item: DietItem) => void
  onRemove: () => void
  onClose: () => void
}

/**
 * Jedno danie w diecie: liczba porcji, gramatury składników (−/+), wartości odżywcze i dopasowanie do celu posiłku.
 * Zmiany dotyczą tylko tej diety, nie oryginalnego przepisu.
 */
export function DietItemSheet({ item, mealTarget, others, lowSalt, highFiber, readOnly, onChange, onRemove, onClose }: Props) {
  const db = useFoodDb()
  const [adapt, setAdapt] = useState(false)

  const analysis = useMemo(() => (db ? analyzeRecipe(item.lines, db) : null), [db, item.lines])
  const eaten = useMemo(() => (analysis ? analysis.total.map((v) => v * item.portions) : null), [analysis, item.portions])

  // Cel dla tego dania = cel posiłku minus to, co już dają pozostałe dania (co najmniej 20% celu posiłku)
  const target = useMemo<MealTarget>(() => {
    const keep = (goal: number, used: number) => Math.max(goal * 0.2, goal - used)
    return {
      kcal: keep(mealTarget.kcal, others[IDX.kcal]),
      protein: keep(mealTarget.protein, others[IDX.protein]),
      fat: keep(mealTarget.fat, others[IDX.fat]),
      carbs: keep(mealTarget.carbs, others[IDX.carbs]),
    }
  }, [mealTarget, others])
  const perPortion: MealTarget = {
    kcal: target.kcal / item.portions,
    protein: target.protein / item.portions,
    fat: target.fat / item.portions,
    carbs: target.carbs / item.portions,
  }

  return createPortal(
    <>
      <Sheet onClose={onClose}>
        <header className="flex h-11 shrink-0 items-center justify-between px-4">
          <button onClick={onClose} className="text-[17px] text-accent active:opacity-50">
            Gotowe
          </button>
          <h2 className="max-w-[60%] truncate text-[17px] font-semibold">{item.title}</h2>
          <span className="w-14" />
        </header>

        <div className="scroll-y flex-1 space-y-5 px-4 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+32px)]">
          <div className="flex items-center justify-between rounded-[14px] bg-surface px-4 py-3">
            <span className="text-[16px]">Porcje</span>
            {readOnly ? (
              <span className="font-semibold tabular-nums">{formatAmount(item.portions)}</span>
            ) : (
              <span className="flex items-center gap-3">
                <Step label="Mniej porcji" onClick={() => onChange(withPortions(item, item.portions - 0.25))}>
                  <MinusIcon width={16} height={16} />
                </Step>
                <span className="min-w-10 text-center text-[19px] font-bold tabular-nums">{String(item.portions).replace('.', ',')}</span>
                <Step label="Więcej porcji" onClick={() => onChange(withPortions(item, item.portions + 0.25))}>
                  <PlusIcon width={16} height={16} />
                </Step>
              </span>
            )}
          </div>

          {!db || !eaten || !analysis ? (
            <div className="flex justify-center py-6 text-label-2">
              <SpinnerIcon width={22} height={22} />
            </div>
          ) : (
            <>
              <NutritionSummary n={eaten} target={target} title="To danie w posiłku (wartości / cel dla tego dania)" />

              <section>
                <p className="mb-1.5 px-1 text-[13px] text-label-2 uppercase">Składniki jednej porcji</p>
                <ul className="divide-y divide-separator overflow-hidden rounded-[14px] bg-surface">
                  {item.lines.map((line, i) => {
                    const a = analysis.lines[i]
                    const parsed = parseIngredient(line.text)
                    const amount = parsed.value
                    const canStep = !readOnly && (parsed.kind === 'g' || parsed.kind === 'ml') && amount !== undefined
                    return (
                      <li key={`${i}-${line.text}`} className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-[15px]">{parsed.name || line.text}</span>
                          {canStep ? (
                            <span className="flex shrink-0 items-center gap-1.5">
                              <Step small label="Mniej" onClick={() => onChange(withLineAmount(item, i, Math.max(1, amount - gramStep(amount))))}>
                                <MinusIcon width={14} height={14} />
                              </Step>
                              <span className="min-w-[4.5rem] text-center text-[15px] font-semibold tabular-nums">
                                {formatAmount(amount)} {parsed.kind}
                              </span>
                              <Step small label="Więcej" onClick={() => onChange(withLineAmount(item, i, amount + gramStep(amount)))}>
                                <PlusIcon width={14} height={14} />
                              </Step>
                            </span>
                          ) : (
                            <span className="shrink-0 text-[13px] text-label-2 tabular-nums">{parsed.kind === undefined ? 'bez ilości' : line.text.split(' ')[0]}</span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-[12px] text-label-2">
                          {a.food ? `→ ${a.food.name}` : 'brak w bazie — nie liczy się do wartości'}
                          {a.nutrients && <span className="tabular-nums"> · {formatAmount(a.nutrients[IDX.kcal])} kcal</span>}
                        </p>
                      </li>
                    )
                  })}
                </ul>
              </section>

              {!readOnly && (
                <div className="space-y-2">
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setAdapt(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-accent py-3.5 text-[16px] font-semibold text-white"
                  >
                    <SlidersIcon width={18} height={18} /> Dopasuj do celu posiłku
                  </motion.button>
                  <button
                    onClick={() => {
                      onRemove()
                      onClose()
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-surface py-3.5 text-[16px] font-medium text-red-500 active:opacity-60"
                  >
                    <TrashIcon width={18} height={18} /> Usuń z posiłku
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </Sheet>

      <AnimatePresence>
        {adapt && (
          <AdaptSheet
            key="adapt"
            title="Dopasuj do celu posiłku"
            ingredients={item.lines}
            servings={1}
            target={perPortion}
            lowSalt={lowSalt}
            highFiber={highFiber}
            applyLabel="Zastosuj w tym daniu"
            appliedLabel="Zmieniono w diecie"
            footnote="Zmiany dotyczą tylko tego dania w diecie; oryginalny przepis zostaje bez zmian."
            onClose={() => setAdapt(false)}
            onApply={(lines) => {
              onChange({ ...item, lines })
              setAdapt(false)
            }}
          />
        )}
      </AnimatePresence>
    </>,
    document.body,
  )
}

function Step({ children, label, onClick, small }: { children: React.ReactNode; label: string; onClick: () => void; small?: boolean }) {
  return (
    <motion.button
      whileTap={{ scale: 0.86 }}
      onClick={onClick}
      aria-label={label}
      className={`flex items-center justify-center rounded-full ${small ? 'h-7 w-7 bg-surface-2 text-label' : 'h-9 w-9 bg-accent text-white'}`}
    >
      {children}
    </motion.button>
  )
}
