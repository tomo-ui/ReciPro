import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Profile, Recipe } from '@/types/recipe'
import type { Diet, DietDraft, DietItem, DietMeal } from '@/types/diet'
import { backend } from '@/lib/data'
import {
  analyzeDiet,
  copyDiet,
  dayTargetOf,
  itemFromFood,
  itemFromRecipe,
  mealLayout,
  mealTargetOf,
  MAX_MEALS,
  normalizeShares,
  sumNutrients,
  withPortions,
} from '@/lib/diet'
import { IDX, formatAmount } from '@/lib/nutrients'
import { coverGradient, timeAgo } from '@/lib/ui'
import { useFoodDb } from '@/hooks/useFoodDb'
import { Avatar } from '@/components/Avatar'
import { DietItemSheet } from '@/components/DietItemSheet'
import { DishPicker } from '@/components/DishPicker'
import { CheckIcon, ChevronDownIcon, MinusIcon, PlusIcon, SpinnerIcon, TrashIcon } from '@/components/Icons'
import { Bar, MacroLine, NutritionSummary } from '@/components/NutritionSummary'
import { TargetsEditor } from '@/components/TargetsEditor'
import { Toggle } from '@/components/formParts'

interface Props {
  dietId: string
  me: Profile
  /** Moje przepisy do wyboru przy dodawaniu dania */
  recipes: Recipe[]
  onOpenProfile: (username: string) => void
  /** Cudza dieta została zapisana u mnie — pokazujemy kopię do dalszych zmian */
  onCopied: (diet: Diet) => void
  onDeleted: () => void
  /** Zmiana w diecie (lista diet na profilu odświeża się) */
  onChanged: () => void
}

const draftOf = (d: Diet): DietDraft => ({
  id: d.id,
  title: d.title,
  description: d.description,
  meals: d.meals,
  targets: d.targets,
  is_public: d.is_public,
  source: d.source,
})

type SaveState = 'saved' | 'pending' | 'saving' | 'error'

/**
 * Dieta: dzienne podsumowanie względem celu, posiłki z daniami, dodawanie dań, zmiana porcji i gramatur,
 * dopasowanie dania do celu posiłku. Własna dieta zapisuje się sama; cudzą można obejrzeć i zapisać u siebie.
 */
export function DietScreen({ dietId, me, recipes, onOpenProfile, onCopied, onDeleted, onChanged }: Props) {
  const db = useFoodDb()
  const [diet, setDiet] = useState<Diet | null | undefined>(undefined)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [goalsOpen, setGoalsOpen] = useState(false)
  const [picking, setPicking] = useState<string | null>(null) // id posiłku, do którego dodajemy
  const [editing, setEditing] = useState<{ mealId: string; itemId: string } | null>(null)
  const [copying, setCopying] = useState(false)

  useEffect(() => {
    let alive = true
    backend
      .getDiet(dietId)
      .then((d) => alive && setDiet(d))
      .catch((e: unknown) => {
        if (!alive) return
        setDiet(null)
        setLoadError(e instanceof Error ? e.message : 'Nie udało się wczytać diety.')
      })
    return () => {
      alive = false
    }
  }, [dietId])

  const readOnly = !!diet && diet.user_id !== me.id

  /* — autozapis własnej diety — */
  const latest = useRef<Diet | null>(null)
  const dirty = useRef(false)
  latest.current = diet ?? null

  const flush = useCallback(async () => {
    const d = latest.current
    if (!d || !dirty.current) return
    dirty.current = false
    setSaveState('saving')
    try {
      await backend.saveDiet(draftOf(d))
      setSaveState(dirty.current ? 'pending' : 'saved')
      setSaveError(null)
      onChanged()
    } catch (e) {
      dirty.current = true
      setSaveState('error')
      setSaveError(e instanceof Error ? e.message : 'Nie udało się zapisać diety.')
    }
  }, [onChanged])

  const change = useCallback((updater: (d: Diet) => Diet) => {
    setDiet((d) => (d ? updater(d) : d))
    dirty.current = true
    setSaveState('pending')
  }, [])

  useEffect(() => {
    if (saveState !== 'pending') return
    const t = setTimeout(() => void flush(), 700)
    return () => clearTimeout(t)
  }, [diet, saveState, flush])

  // Zamknięcie ekranu z niezapisanymi zmianami: zapisujemy od razu
  useEffect(
    () => () => {
      if (dirty.current && latest.current) void backend.saveDiet(draftOf(latest.current)).then(onChanged).catch(() => {})
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const analysis = useMemo(() => (db && diet ? analyzeDiet(diet, db) : null), [db, diet])

  if (diet === undefined) {
    return (
      <div className="flex justify-center pt-24 text-label-2">
        <SpinnerIcon width={24} height={24} />
      </div>
    )
  }
  if (diet === null) {
    return <p className="px-6 pt-24 text-center text-[16px] text-label-2">{loadError ?? 'Nie znaleziono diety albo nie jest udostępniona.'}</p>
  }

  const dayTarget = dayTargetOf(diet.targets)

  /* — zmiany w posiłkach — */
  const setMeals = (fn: (meals: DietMeal[]) => DietMeal[]) => change((d) => ({ ...d, meals: fn(d.meals) }))
  const patchMeal = (mealId: string, fn: (m: DietMeal) => DietMeal) => setMeals((meals) => meals.map((m) => (m.id === mealId ? fn(m) : m)))
  const patchItem = (mealId: string, item: DietItem) => patchMeal(mealId, (m) => ({ ...m, items: m.items.map((i) => (i.id === item.id ? item : i)) }))
  const addItem = (mealId: string, item: DietItem) => patchMeal(mealId, (m) => ({ ...m, items: [...m.items, item] }))
  const removeItem = (mealId: string, itemId: string) => patchMeal(mealId, (m) => ({ ...m, items: m.items.filter((i) => i.id !== itemId) }))

  function setShare(mealId: string, share: number) {
    setMeals((meals) => {
      const value = Math.min(90, Math.max(1, Math.round(share)))
      const others = meals.filter((m) => m.id !== mealId)
      const restSum = others.reduce((a, m) => a + m.share, 0) || 1
      const scaled = meals.map((m) => (m.id === mealId ? { ...m, share: value } : { ...m, share: (m.share / restSum) * (100 - value) }))
      return normalizeShares(others.length === 0 ? [{ ...meals[0], share: 100 }] : scaled)
    })
  }

  function setMealCount(n: number) {
    const count = Math.min(MAX_MEALS, Math.max(1, n))
    if (count === diet!.meals.length) return
    if (count < diet!.meals.length) {
      const removed = diet!.meals.slice(count)
      if (removed.some((m) => m.items.length > 0) && !confirm('Usunięte posiłki zawierają dania. Usunąć je z diety?')) return
    }
    setMeals((meals) => {
      const layout = mealLayout(count)
      const next = Array.from({ length: count }, (_, i): DietMeal => meals[i] ?? { id: crypto.randomUUID(), name: layout[i].name, share: layout[i].share, items: [] })
      return next.map((m, i) => ({ ...m, share: layout[i].share })) // domyślny podział kalorii dla nowej liczby posiłków
    })
  }

  async function saveCopy() {
    if (!diet || copying) return
    setCopying(true)
    setSaveError(null)
    try {
      const saved = await backend.saveDiet(copyDiet(diet))
      onChanged()
      onCopied(saved)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Nie udało się zapisać diety.')
      setCopying(false)
    }
  }

  const editingMeal = editing ? diet.meals.find((m) => m.id === editing.mealId) : undefined
  const editingItem = editingMeal?.items.find((i) => i.id === editing?.itemId)
  const othersFor = (meal: DietMeal, itemId: string) => sumNutrients(analysis!.meals.find((m) => m.meal.id === meal.id)!.items.filter((i) => i.item.id !== itemId).map((i) => i.n))

  return (
    <div className="space-y-5 px-[max(16px,env(safe-area-inset-left))] pt-4 pb-6">
      {readOnly && (
        <div className="rounded-[16px] bg-surface p-4">
          <button onClick={() => diet.author && onOpenProfile(diet.author.username)} className="flex items-center gap-2.5 text-left">
            <Avatar name={diet.author?.username ?? '?'} src={diet.author?.avatar_url} size={34} />
            <span>
              <span className="block text-[15px] leading-tight font-semibold">{diet.author?.username}</span>
              <span className="block text-[12px] text-label-2">ułożył(a) tę dietę · {timeAgo(diet.updated_at)}</span>
            </span>
          </button>
          <p className="mt-3 text-[14px] text-label-2">Możesz ją zapisać u siebie i dowolnie dopasować pod swoje cele. Oryginał autora zostanie bez zmian.</p>
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={saveCopy}
            disabled={copying}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-[14px] bg-accent py-3.5 text-[16px] font-semibold text-white disabled:opacity-60"
          >
            {copying && <SpinnerIcon width={18} height={18} />} Zapisz u siebie
          </motion.button>
          {saveError && <p className="mt-2 text-[13px] text-red-500">{saveError}</p>}
        </div>
      )}

      <div>
        {readOnly ? (
          <h1 className="text-[26px] leading-tight font-bold tracking-tight">{diet.title}</h1>
        ) : (
          <input
            value={diet.title}
            onChange={(e) => change((d) => ({ ...d, title: e.target.value.slice(0, 120) }))}
            onBlur={() => !diet.title.trim() && change((d) => ({ ...d, title: 'Moja dieta' }))}
            aria-label="Nazwa diety"
            placeholder="Nazwa diety"
            className="w-full bg-transparent text-[26px] leading-tight font-bold tracking-tight outline-none placeholder:text-label-3"
          />
        )}
        {diet.source && (
          <p className="mt-1 text-[13px] text-label-2">
            Na podstawie diety{' '}
            <button onClick={() => diet.source && onOpenProfile(diet.source.username)} className="font-semibold text-accent">
              @{diet.source.username}
            </button>
            {diet.source.title !== diet.title && <> „{diet.source.title}”</>}
          </p>
        )}
        {readOnly ? (
          diet.description && <p className="mt-2 text-[15px] text-label-2">{diet.description}</p>
        ) : (
          <textarea
            value={diet.description ?? ''}
            onChange={(e) => change((d) => ({ ...d, description: e.target.value.slice(0, 1000) }))}
            placeholder="Opis (opcjonalnie)"
            aria-label="Opis diety"
            rows={1}
            className="mt-1 block w-full resize-none bg-transparent text-[15px] text-label-2 outline-none [field-sizing:content] placeholder:text-label-3"
          />
        )}
        {!readOnly && <SaveIndicator state={saveState} error={saveError} onRetry={() => void flush()} />}
      </div>

      {analysis ? (
        <NutritionSummary n={analysis.day} target={dayTarget} title="Cała dieta w ciągu dnia" />
      ) : (
        <div className="flex justify-center py-6 text-label-2">
          <SpinnerIcon width={22} height={22} />
        </div>
      )}

      {!readOnly && (
        <section>
          <button onClick={() => setGoalsOpen((o) => !o)} aria-expanded={goalsOpen} className="mb-1.5 flex w-full items-center justify-between px-1 text-left">
            <span className="text-[13px] text-label-2 uppercase">
              Cele dnia: {diet.targets.kcalPerDay} kcal · B {diet.targets.protein}% T {diet.targets.fat}% W {diet.targets.carbs}%
            </span>
            <ChevronDownIcon width={16} height={16} className={`text-label-2 transition-transform ${goalsOpen ? 'rotate-180' : ''}`} />
          </button>
          <AnimatePresence initial={false}>
            {goalsOpen && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <TargetsEditor
                  value={diet.targets}
                  onChange={(targets) => change((d) => ({ ...d, targets }))}
                  meals={{ count: diet.meals.length, onChange: setMealCount }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      )}

      <div className="space-y-4">
        {diet.meals.map((meal, index) => {
          const mealAnalysis = analysis?.meals[index]
          const target = mealTargetOf(diet.targets, meal.share)
          const kcal = mealAnalysis?.total[IDX.kcal] ?? 0
          return (
            <section key={meal.id} className="overflow-hidden rounded-[18px] bg-surface">
              <div className="px-4 pt-3.5 pb-2">
                <div className="flex items-center gap-2">
                  {readOnly ? (
                    <h2 className="flex-1 text-[19px] font-bold">{meal.name}</h2>
                  ) : (
                    <input
                      value={meal.name}
                      onChange={(e) => patchMeal(meal.id, (m) => ({ ...m, name: e.target.value.slice(0, 40) }))}
                      aria-label="Nazwa posiłku"
                      className="min-w-0 flex-1 bg-transparent text-[19px] font-bold outline-none"
                    />
                  )}
                  <span className="shrink-0 text-[13px] text-label-2 tabular-nums">
                    {formatAmount(kcal)} / {formatAmount(target.kcal)} kcal
                  </span>
                </div>
                <div className="mt-2">
                  <Bar value={kcal} goal={target.kcal} color="var(--accent)" />
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2 text-[12px] text-label-2">
                  {mealAnalysis ? <MacroLine n={mealAnalysis.total} /> : <span />}
                  {!readOnly && diet.meals.length > 1 && (
                    <span className="flex shrink-0 items-center gap-1.5">
                      <MiniStep label="Mniejszy udział" onClick={() => setShare(meal.id, meal.share - 5)}>
                        <MinusIcon width={12} height={12} />
                      </MiniStep>
                      <span className="tabular-nums">{meal.share}% dnia</span>
                      <MiniStep label="Większy udział" onClick={() => setShare(meal.id, meal.share + 5)}>
                        <PlusIcon width={12} height={12} />
                      </MiniStep>
                    </span>
                  )}
                  {(readOnly || diet.meals.length <= 1) && <span>{meal.share}% dnia</span>}
                </div>
              </div>

              <ul className="divide-y divide-separator border-t border-separator">
                {meal.items.map((item, i) => {
                  const n = mealAnalysis?.items[i]?.n
                  return (
                    <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                      <button onClick={() => setEditing({ mealId: meal.id, itemId: item.id })} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`Otwórz: ${item.title}`}>
                        <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-[10px]" style={{ background: coverGradient(item.title) }}>
                          {item.image_url && <img src={item.image_url} alt="" draggable={false} loading="lazy" className="absolute inset-0 h-full w-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-medium">{item.title}</span>
                          <span className="block truncate text-[12px] text-label-2 tabular-nums">
                            {String(item.portions).replace('.', ',')} {item.portions === 1 ? 'porcja' : 'porcji'}
                            {n && <> · {formatAmount(n[IDX.kcal])} kcal · B {formatAmount(n[IDX.protein])} T {formatAmount(n[IDX.fat])} W {formatAmount(n[IDX.carbs])}</>}
                          </span>
                        </span>
                      </button>
                      {!readOnly && (
                        <span className="flex shrink-0 items-center gap-1">
                          <MiniStep label="Mniej porcji" onClick={() => patchItem(meal.id, withPortions(item, item.portions - 0.25))}>
                            <MinusIcon width={13} height={13} />
                          </MiniStep>
                          <MiniStep label="Więcej porcji" onClick={() => patchItem(meal.id, withPortions(item, item.portions + 0.25))}>
                            <PlusIcon width={13} height={13} />
                          </MiniStep>
                        </span>
                      )}
                    </li>
                  )
                })}
                {meal.items.length === 0 && <li className="px-4 py-3 text-[14px] text-label-2">Brak dań w tym posiłku.</li>}
              </ul>

              {!readOnly && (
                <button onClick={() => setPicking(meal.id)} className="flex w-full items-center justify-center gap-1.5 border-t border-separator py-3 text-[15px] font-semibold text-accent active:bg-surface-2">
                  <PlusIcon width={16} height={16} /> Dodaj danie
                </button>
              )}
            </section>
          )
        })}
      </div>

      {!readOnly && (
        <>
          <div className="overflow-hidden rounded-[14px] bg-surface">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[16px]">
                Widoczna dla innych
                <span className="block text-[12px] text-label-2">Na Twoim profilu w zakładce Dieta (gdy profil jest publiczny). Inni mogą ją zapisać u siebie.</span>
              </span>
              <Toggle checked={diet.is_public} onChange={(is_public) => change((d) => ({ ...d, is_public }))} label="Widoczna dla innych" />
            </div>
          </div>

          <button
            onClick={() => {
              if (confirm('Usunąć tę dietę?')) void backend.deleteDiet(diet.id).then(() => {
                dirty.current = false
                onChanged()
                onDeleted()
              })
            }}
            className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-surface py-3.5 text-[16px] font-medium text-red-500 active:opacity-60"
          >
            <TrashIcon width={18} height={18} /> Usuń dietę
          </button>
        </>
      )}

      <AnimatePresence>
        {picking && (
          <DishPicker
            key="picker"
            recipes={recipes}
            onClose={() => setPicking(null)}
            onPickRecipe={(r) => {
              addItem(picking, itemFromRecipe(r))
              setPicking(null)
            }}
            onPickFood={(food, grams) => {
              addItem(picking, itemFromFood(food, grams))
              setPicking(null)
            }}
          />
        )}
        {editingMeal && editingItem && analysis && (
          <DietItemSheet
            key={editingItem.id}
            item={editingItem}
            mealTarget={mealTargetOf(diet.targets, editingMeal.share)}
            others={othersFor(editingMeal, editingItem.id)}
            lowSalt={diet.targets.lowSalt}
            highFiber={diet.targets.highFiber}
            readOnly={readOnly}
            onChange={(item) => patchItem(editingMeal.id, item)}
            onRemove={() => removeItem(editingMeal.id, editingItem.id)}
            onClose={() => setEditing(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function SaveIndicator({ state, error, onRetry }: { state: SaveState; error: string | null; onRetry: () => void }) {
  if (state === 'error')
    return (
      <p className="mt-1 text-[12px] text-red-500">
        {error ?? 'Nie udało się zapisać.'}{' '}
        <button onClick={onRetry} className="font-semibold underline">
          Spróbuj ponownie
        </button>
      </p>
    )
  return (
    <p className="mt-1 flex items-center gap-1 text-[12px] text-label-2">
      {state === 'saved' ? <CheckIcon width={12} height={12} /> : <SpinnerIcon width={12} height={12} />}
      {state === 'saved' ? 'Zapisano' : 'Zapisywanie…'}
    </p>
  )
}

function MiniStep({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <motion.button whileTap={{ scale: 0.85 }} onClick={onClick} aria-label={label} className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-2 text-label">
      {children}
    </motion.button>
  )
}
