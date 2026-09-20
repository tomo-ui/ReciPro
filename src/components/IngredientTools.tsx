import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { FormState } from '@/lib/recipeForm'
import { shortName, type Food } from '@/lib/foodDb'
import { IDX, formatAmount, zeroNutrients } from '@/lib/nutrients'
import { analyzeLine, withAmount } from '@/lib/nutrition'
import { useFoodDb } from '@/hooks/useFoodDb'
import { ChevronDownIcon, FlameIcon, MinusIcon, PlusIcon, SearchIcon } from './Icons'
import { FoodPicker, gramStep } from './FoodPicker'

interface Props {
  form: FormState
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void
}

/**
 * Pod polem składników: dodawanie z bazy (kilka tysięcy produktów), mechaniczna zmiana gramatury
 * przyciskami −/+ oraz podsumowanie kalorii i makroskładników na bieżąco. Zmiany trafiają do pola tekstowego,
 * więc formularz nadal zapisuje zwykły tekst; wybór produktu z bazy zapamiętujemy w `form.foodIds`.
 */
export function IngredientTools({ form, set }: Props) {
  const db = useFoodDb()
  const [picker, setPicker] = useState<{ kind: 'add' } | { kind: 'change'; line: string } | null>(null)
  const [open, setOpen] = useState(true)

  const rows = useMemo(
    () =>
      form.ingredients
        .split('\n')
        .map((raw, index) => ({ index, raw: raw.trim() }))
        .filter((r) => r.raw && !r.raw.startsWith('#')),
    [form.ingredients],
  )
  const analyses = useMemo(
    () => (db ? rows.map((r) => ({ ...r, a: analyzeLine({ text: r.raw, food_id: form.foodIds?.[r.raw] }, db) })) : []),
    [db, rows, form.foodIds],
  )

  const servings = parseInt(form.servings, 10) || undefined
  const total = useMemo(() => {
    const t = zeroNutrients()
    for (const r of analyses) if (r.a.nutrients) r.a.nutrients.forEach((v, i) => (t[i] += v))
    return t
  }, [analyses])
  const counted = analyses.filter((r) => r.a.status === 'ok').length
  const withAmountCount = analyses.filter((r) => r.a.status !== 'no-amount').length

  function replaceLine(index: number, oldText: string, newText: string, foodId?: number) {
    const lines = form.ingredients.split('\n')
    lines[index] = newText
    set('ingredients', lines.join('\n'))
    const id = foodId ?? form.foodIds?.[oldText]
    if (id !== undefined) set('foodIds', { ...(form.foodIds ?? {}), [newText]: id })
  }

  function addFood(food: Food, grams: number) {
    const line = `${grams} g ${shortName(food)}`
    const existing = form.ingredients.replace(/\s+$/, '')
    set('ingredients', existing ? `${existing}\n${line}` : line)
    set('foodIds', { ...(form.foodIds ?? {}), [line]: food.id })
  }

  const changeFood = (line: string, food: Food) => set('foodIds', { ...(form.foodIds ?? {}), [line]: food.id })

  const kcal = total[IDX.kcal]
  const shown = servings ? 1 / servings : 1

  return (
    <div className="space-y-3">
      <motion.button
        type="button"
        whileTap={{ scale: 0.98 }}
        onClick={() => setPicker({ kind: 'add' })}
        className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-surface py-3 text-[16px] font-semibold text-accent"
      >
        <SearchIcon width={18} height={18} /> Dodaj z bazy składników
      </motion.button>

      {analyses.length > 0 && (
        <div className="overflow-hidden rounded-[14px] bg-surface">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="flex w-full items-center gap-3 px-4 py-3 text-left"
          >
            <FlameIcon width={20} height={20} className="shrink-0 text-accent" />
            <span className="flex-1">
              {counted > 0 ? (
                <>
                  <span className="text-[17px] font-bold tabular-nums">≈ {formatAmount(kcal * shown)} kcal</span>{' '}
                  <span className="text-[13px] text-label-2">{servings ? 'na porcję' : 'łącznie'}</span>
                  <span className="block text-[12px] text-label-2 tabular-nums">
                    B {formatAmount(total[IDX.protein] * shown)} g · T {formatAmount(total[IDX.fat] * shown)} g · W {formatAmount(total[IDX.carbs] * shown)} g
                  </span>
                </>
              ) : (
                <span className="text-[14px] text-label-2">Dodaj składniki z ilością, a policzę kalorie</span>
              )}
            </span>
            <ChevronDownIcon width={18} height={18} className={`shrink-0 text-label-2 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>

          <AnimatePresence initial={false}>
            {open && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <ul className="divide-y divide-separator border-t border-separator">
                  {analyses.map((r) => {
                    const { a } = r
                    const amount = a.parsed.value
                    return (
                      <li key={`${r.index}-${r.raw}`} className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-[15px]">{a.parsed.name || r.raw}</span>
                          {a.adjustable && amount !== undefined ? (
                            <span className="flex shrink-0 items-center gap-1.5">
                              <Stepper label="Mniej" onClick={() => replaceLine(r.index, r.raw, withAmount(r.raw, Math.max(1, amount - gramStep(amount))))}>
                                <MinusIcon width={14} height={14} />
                              </Stepper>
                              <span className="min-w-[4.5rem] text-center text-[15px] font-semibold tabular-nums">
                                {formatAmount(amount)} {a.parsed.kind}
                              </span>
                              <Stepper label="Więcej" onClick={() => replaceLine(r.index, r.raw, withAmount(r.raw, amount + gramStep(amount)))}>
                                <PlusIcon width={14} height={14} />
                              </Stepper>
                            </span>
                          ) : (
                            <span className="shrink-0 text-[13px] text-label-2">{a.status === 'no-amount' ? 'bez ilości' : 'sztuki'}</span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setPicker({ kind: 'change', line: r.raw })}
                          className="mt-0.5 flex w-full items-center gap-1.5 text-left text-[12px] text-label-2"
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {a.food ? <>→ {a.food.name}</> : 'Nie znaleziono w bazie — wybierz produkt'}
                            {a.manual && ' (wybrany przez Ciebie)'}
                          </span>
                          {a.nutrients && <span className="shrink-0 tabular-nums">{formatAmount(a.nutrients[IDX.kcal])} kcal</span>}
                        </button>
                      </li>
                    )
                  })}
                </ul>
                <p className="border-t border-separator px-4 py-2.5 text-[12px] text-label-2">
                  Szacunek z bazy składników ({counted} z {withAmountCount} pozycji z ilością). Zmiana gramatury przyciskami − / + poprawia tekst składnika.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {picker?.kind === 'add' && (
          <FoodPicker
            key="add"
            askAmount
            onClose={() => setPicker(null)}
            onPick={(food, grams) => {
              addFood(food, grams ?? 100)
              setPicker(null)
            }}
          />
        )}
        {picker?.kind === 'change' && (
          <FoodPicker
            key="change"
            title="Zmień produkt"
            initialQuery={analyses.find((r) => r.raw === picker.line)?.a.parsed.name ?? ''}
            onClose={() => setPicker(null)}
            onPick={(food) => {
              changeFood(picker.line, food)
              setPicker(null)
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function Stepper({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.86 }}
      onClick={onClick}
      aria-label={label}
      className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-2 text-label"
    >
      {children}
    </motion.button>
  )
}
