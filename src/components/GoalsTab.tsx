import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Recipe, RecipeDraft } from '@/types/recipe'
import { mealTargetOf, targetsFromPrefs } from '@/lib/diet'
import { formatAmount } from '@/lib/nutrients'
import { analyzeRecipe, kcalPerServing } from '@/lib/nutrition'
import { sanitize } from '@/lib/prefs'
import { coverGradient } from '@/lib/ui'
import { useFoodDb } from '@/hooks/useFoodDb'
import { usePrefs } from '@/hooks/usePrefs'
import { AdaptSheet } from './AdaptSheet'
import { SlidersIcon, SpinnerIcon } from './Icons'
import { TargetsEditor } from './TargetsEditor'

interface Props {
  /** Moje przepisy */
  recipes: Recipe[]
  /** Zapisuje dopasowaną wersję jako nowy przepis */
  onSaveRecipe: (draft: RecipeDraft) => Promise<void>
  /** Bez sekcji „Dopasuj danie do celu” — tylko cele dzienne (kalorie i makro) */
  hideAdapt?: boolean
}

/**
 * Zakładka „Cele”: ustawiam kalorie i makro na dzień i (poza `hideAdapt`) widzę, jak moje dania mają się
 * do celu jednego posiłku, i dopasowuję wybrane danie (gramatury składników) tak, żeby w nie trafiało.
 */
export function GoalsTab({ recipes, onSaveRecipe, hideAdapt }: Props) {
  const db = useFoodDb(!hideAdapt)
  const { prefs, update } = usePrefs()
  const [adapting, setAdapting] = useState<Recipe | null>(null)

  const targets = useMemo(() => targetsFromPrefs(prefs), [prefs])
  const target = useMemo(() => mealTargetOf(targets, 100 / prefs.mealsPerDay), [targets, prefs.mealsPerDay])

  const rows = useMemo(
    () =>
      db && !hideAdapt
        ? recipes.map((r) => {
            const a = analyzeRecipe(r.ingredients, db, r.servings)
            return { recipe: r, kcal: kcalPerServing(a) }
          })
        : [],
    [db, recipes, hideAdapt],
  )

  return (
    <div className="space-y-5 pt-4">
      <section>
        <p className="mb-1.5 px-1 text-[13px] text-label-2 uppercase">Moje cele</p>
        <TargetsEditor
          value={targets}
          onChange={(t) => update(sanitize({ ...prefs, ...t }))}
          meals={{ count: prefs.mealsPerDay, onChange: (mealsPerDay) => update({ mealsPerDay }) }}
        />
        <p className="mt-1.5 px-1 text-[12px] text-label-2">
          Cel jednego posiłku: {Math.round(target.kcal)} kcal · B {Math.round(target.protein)} g · T {Math.round(target.fat)} g · W {Math.round(target.carbs)} g. Ustawienia zostają na tym urządzeniu i są
          podpowiedzią przy nowych dietach.
        </p>
      </section>

      {!hideAdapt && (
        <section>
        <p className="mb-1.5 px-1 text-[13px] text-label-2 uppercase">Dopasuj danie do celu</p>
        {recipes.length === 0 ? (
          <p className="rounded-[14px] bg-surface p-4 text-[14px] text-label-2">Nie masz jeszcze przepisów. Dodaj przepis, a tutaj dopasujesz go do swoich celów.</p>
        ) : !db ? (
          <div className="flex justify-center py-8 text-label-2">
            <SpinnerIcon width={22} height={22} />
          </div>
        ) : (
          <ul className="divide-y divide-separator overflow-hidden rounded-[14px] bg-surface">
            {rows.map(({ recipe, kcal }) => {
              const off = kcal ? (kcal - target.kcal) / target.kcal : null
              const fit = off === null ? null : Math.abs(off) <= 0.1 ? { text: 'pasuje do celu', color: 'text-green-600' } : off > 0 ? { text: `+${Math.round(off * 100)}% ponad cel`, color: 'text-red-500' } : { text: `${Math.round(off * 100)}% poniżej celu`, color: 'text-amber-500' }
              return (
                <li key={recipe.id}>
                  <motion.button
                    whileTap={{ backgroundColor: 'var(--surface-2)' }}
                    onClick={() => setAdapting(recipe)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left"
                  >
                    <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[10px]" style={{ background: coverGradient(recipe.title) }}>
                      {recipe.image_url && <img src={recipe.image_url} alt="" draggable={false} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-[16px] leading-snug font-medium">{recipe.title}</span>
                      <span className="block text-[12px] text-label-2 tabular-nums">
                        {kcal ? `≈ ${formatAmount(kcal)} kcal na porcję` : 'za mało danych o składnikach'}
                        {fit && <span className={`ml-1.5 font-semibold ${fit.color}`}>{fit.text}</span>}
                      </span>
                    </span>
                    <SlidersIcon width={20} height={20} className="shrink-0 text-accent" />
                  </motion.button>
                </li>
              )
            })}
          </ul>
        )}
        <p className="mt-1.5 px-1 text-[12px] text-label-2">Kalorie liczone z bazy składników (USDA), na porcję przepisu. Dopasowany przepis zapisuje się jako nowy.</p>
        </section>
      )}

      <AnimatePresence>
        {adapting && (
          <AdaptSheet
            key={adapting.id}
            title={adapting.title}
            ingredients={adapting.ingredients}
            servings={adapting.servings}
            target={target}
            lowSalt={prefs.lowSalt}
            highFiber={prefs.highFiber}
            applyLabel="Zapisz jako nowy przepis"
            appliedLabel="Zapisano w Twoich przepisach"
            footnote="Oryginał zostaje bez zmian. Kopia nie dostaje zdjęcia z oryginału."
            onClose={() => setAdapting(null)}
            onApply={(ingredients) =>
              onSaveRecipe({
                title: `${adapting.title} (dopasowany)`,
                description: adapting.description,
                image_url: undefined,
                source_url: adapting.source_url,
                servings: adapting.servings,
                prep_minutes: adapting.prep_minutes,
                cook_minutes: adapting.cook_minutes,
                total_minutes: adapting.total_minutes,
                ingredients,
                steps: adapting.steps,
                tags: adapting.tags,
                parse_method: 'manual',
              })
            }
          />
        )}
      </AnimatePresence>
    </div>
  )
}
