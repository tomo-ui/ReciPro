import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import type { Recipe } from '@/types/recipe'
import type { Food } from '@/lib/foodDb'
import { fold } from '@/lib/text'
import { analyzeRecipe, kcalPerServing } from '@/lib/nutrition'
import { coverGradient } from '@/lib/ui'
import { useFoodDb } from '@/hooks/useFoodDb'
import { FoodPicker } from './FoodPicker'
import { SearchIcon } from './Icons'
import { Sheet } from './Sheet'

interface Props {
  /** Przepisy do wyboru (moje) */
  recipes: Recipe[]
  onPickRecipe: (recipe: Recipe) => void
  onPickFood: (food: Food, grams: number) => void
  onClose: () => void
}

/** Wybór dania do posiłku: jeden z moich przepisów (z kaloriami na porcję) albo pojedynczy produkt z bazy składników */
export function DishPicker({ recipes, onPickRecipe, onPickFood, onClose }: Props) {
  const db = useFoodDb()
  const [query, setQuery] = useState('')
  const [foodPicker, setFoodPicker] = useState(false)

  const shown = useMemo(() => {
    const q = fold(query.trim())
    return q ? recipes.filter((r) => fold(`${r.title} ${r.tags.join(' ')}`).includes(q)) : recipes
  }, [recipes, query])

  const kcal = useMemo(() => {
    const map = new Map<string, number | null>()
    if (db) for (const r of recipes) map.set(r.id, kcalPerServing(analyzeRecipe(r.ingredients, db, r.servings)))
    return map
  }, [db, recipes])

  return createPortal(
    <>
      <Sheet onClose={onClose}>
        <header className="flex h-11 shrink-0 items-center justify-between px-4">
          <button onClick={onClose} className="text-[17px] text-accent active:opacity-50">
            Anuluj
          </button>
          <h2 className="text-[17px] font-semibold">Dodaj danie</h2>
          <span className="w-14" />
        </header>

        <div className="space-y-3 px-4 pt-1 pb-3">
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => setFoodPicker(true)}
            className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-surface py-3 text-[16px] font-semibold text-accent"
          >
            <SearchIcon width={18} height={18} /> Produkt z bazy składników
          </motion.button>
          <label className="flex items-center gap-2 rounded-[12px] bg-surface-2 px-3 py-2.5">
            <SearchIcon width={18} height={18} className="shrink-0 text-label-2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Szukaj w moich przepisach"
              aria-label="Szukaj w moich przepisach"
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-label-3"
            />
          </label>
        </div>

        <div className="scroll-y flex-1 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+24px)]">
          {recipes.length === 0 ? (
            <p className="pt-10 text-center text-[15px] text-label-2">Nie masz jeszcze przepisów. Dodaj przepis albo wybierz produkt z bazy składników.</p>
          ) : shown.length === 0 ? (
            <p className="pt-10 text-center text-[15px] text-label-2">Nic nie znaleziono.</p>
          ) : (
            <ul className="divide-y divide-separator overflow-hidden rounded-[14px] bg-surface">
              {shown.map((r) => (
                <li key={r.id}>
                  <motion.button
                    whileTap={{ backgroundColor: 'var(--surface-2)' }}
                    onClick={() => onPickRecipe(r)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left"
                  >
                    <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[10px]" style={{ background: coverGradient(r.title) }}>
                      {r.image_url && <img src={r.image_url} alt="" draggable={false} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-[16px] leading-snug font-medium">{r.title}</span>
                      <span className="block text-[12px] text-label-2">{r.servings ? `${r.servings} porcji` : 'liczba porcji nieznana'}</span>
                    </span>
                    <span className="shrink-0 text-right text-[13px] text-label-2 tabular-nums">
                      {kcal.get(r.id) ? (
                        <>
                          <span className="block font-semibold text-label">≈ {kcal.get(r.id)} kcal</span>
                          na porcję
                        </>
                      ) : db ? (
                        'brak danych'
                      ) : (
                        '…'
                      )}
                    </span>
                  </motion.button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Sheet>

      {foodPicker && (
        <FoodPicker
          askAmount
          title="Produkt do diety"
          onClose={() => setFoodPicker(false)}
          onPick={(food, grams) => {
            onPickFood(food, grams ?? 100)
            setFoodPicker(false)
          }}
        />
      )}
    </>,
    document.body,
  )
}
