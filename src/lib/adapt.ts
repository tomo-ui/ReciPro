import type { IngredientLine } from '@/types/recipe'
import type { FoodDb } from './foodDb'
import { IDX, NUTRIENT_COUNT, type Nutrients } from './nutrients'
import { analyzeRecipe, withAmount, type RecipeNutrition } from './nutrition'
import type { MealTarget } from './prefs'
import { scaleIngredient } from './scale'

/**
 * Dopasowanie przepisu do celów użytkownika (kalorie i makroskładniki na jedną porcję).
 *  - tryb `kcal`: wszystkie składniki skalowane jednakowo, tak żeby porcja miała docelową liczbę kalorii,
 *  - tryb `macros`: gramatury składników w g/ml zmieniane w granicach ±, żeby zbliżyć się do celu
 *    kalorii i proporcji białka, tłuszczu i węglowodanów. Sztuki, przyprawy i sól zostają bez zmian.
 * Wszystko liczone lokalnie z bazy składników; wynik to nowe linie przepisu i porównanie „przed / po”.
 */

export type AdaptMode = 'kcal' | 'macros'

export interface AdaptOptions {
  mode: AdaptMode
  lowSalt?: boolean
  highFiber?: boolean
}

export interface LineChange {
  index: number
  from: string
  to: string
}

export interface AdaptResult {
  mode: AdaptMode
  ingredients: IngredientLine[]
  changes: LineChange[]
  before: Nutrients
  after: Nutrients
  /** Współczynnik skalowania (tryb kcal) */
  factor?: number
  /** Czy wynik mieści się w granicach: kalorie ±5%, makra ±15% celu */
  reached: boolean
  /** Powód, dla którego nie udało się dopasować (brak danych albo za dużo niewiadomych) */
  problem?: string
}

const MIN_FACTOR = 0.5
const MAX_FACTOR = 1.6
const GRID = 0.05
const SWEEPS = 40
const SALT_LIMIT_MG = 600 // sód na porcję, powyżej którego przy „mniej soli” zaczynamy karać
const FIBER_GOAL_G = 8

/** Zaokrąglenie ilości przy zmianie gramatury (jak w normalizacji linii) */
function roundAmount(n: number): number {
  if (n < 10) return Math.max(0.5, Math.round(n * 2) / 2)
  if (n < 50) return Math.round(n)
  if (n < 500) return Math.round(n / 5) * 5
  return Math.round(n / 10) * 10
}

const vec = (n: Nutrients) => [n[IDX.kcal], n[IDX.protein], n[IDX.fat], n[IDX.carbs]]

/** Czy cel jest osiągnięty z zadowalającą dokładnością */
export function isReached(after: Nutrients, target: MealTarget): boolean {
  const [k, p, f, c] = vec(after)
  const within = (v: number, t: number, tol: number) => Math.abs(v - t) <= t * tol + 1
  return within(k, target.kcal, 0.05) && within(p, target.protein, 0.15) && within(f, target.fat, 0.15) && within(c, target.carbs, 0.15)
}

export function adaptRecipe(
  ingredients: IngredientLine[],
  servings: number | undefined,
  db: FoodDb,
  target: MealTarget,
  opts: AdaptOptions,
): AdaptResult {
  const s = servings && servings > 0 ? servings : 1
  const base = analyzeRecipe(ingredients, db, s)
  const before = base.perServing ?? base.total
  const fail = (problem: string): AdaptResult => ({
    mode: opts.mode,
    ingredients,
    changes: [],
    before,
    after: before,
    reached: false,
    problem,
  })
  if (base.counted === 0 || before[IDX.kcal] <= 0) return fail('Za mało danych o składnikach, żeby cokolwiek dopasować.')

  let lines = ingredients.map((l) => ({ ...l }))
  let factor: number | undefined

  if (opts.mode === 'kcal') {
    factor = Math.min(3, Math.max(0.25, target.kcal / before[IDX.kcal]))
    lines = lines.map((l) => ({ ...l, text: scaleIngredient(l.text, factor!).text }))
  } else {
    const multipliers = optimize(base, target, opts, s)
    if (!multipliers) return fail('Ten przepis nie ma składników w g lub ml, którymi dałoby się sterować.')
    lines = lines.map((l, i) => {
      const m = multipliers[i]
      if (m === undefined || Math.abs(m - 1) < 0.03) return l
      const parsed = base.lines[i].parsed
      if (parsed.value === undefined) return l
      return { ...l, text: withAmount(l.text, roundAmount(parsed.value * m)) }
    })
  }

  const changes: LineChange[] = []
  lines.forEach((l, i) => {
    if (l.text !== ingredients[i].text) changes.push({ index: i, from: ingredients[i].text, to: l.text })
  })
  const afterAnalysis = analyzeRecipe(lines, db, s)
  const after = afterAnalysis.perServing ?? afterAnalysis.total
  return { mode: opts.mode, ingredients: lines, changes, before, after, factor, reached: isReached(after, target) }
}

/**
 * Szuka mnożników gramatur (0,5–1,6) dla linii w g/ml, minimalizując odchylenie od celu.
 * Spadek współrzędnych po siatce: dla kilkunastu składników wystarcza i jest deterministyczny.
 */
function optimize(base: RecipeNutrition, target: MealTarget, opts: AdaptOptions, servings: number): (number | undefined)[] | null {
  const perServing = base.lines.map((l) => (l.nutrients ? l.nutrients.map((v) => v / servings) : null))
  const free: number[] = []
  base.lines.forEach((l, i) => {
    const salt = l.food && l.food.n[IDX.sodium] > 10000
    const spice = l.food?.catEn === 'Spices and Herbs'
    if (l.status === 'ok' && l.adjustable && l.parsed.value !== undefined && !salt && !spice && (l.grams ?? 0) >= 5) free.push(i)
  })
  if (free.length === 0) return null

  const m: number[] = new Array(base.lines.length).fill(1)
  const total = (): Nutrients => {
    const t = new Array<number>(NUTRIENT_COUNT).fill(0)
    perServing.forEach((n, i) => {
      if (!n) return
      for (let k = 0; k < NUTRIENT_COUNT; k++) t[k] += n[k] * m[i]
    })
    return t
  }

  const scale = [Math.max(target.kcal, 50), Math.max(target.protein, 5), Math.max(target.fat, 5), Math.max(target.carbs, 10)]
  const goal = [target.kcal, target.protein, target.fat, target.carbs]
  const weights = [1.6, 1, 1, 1]
  const objective = (): number => {
    const t = total()
    const v = vec(t)
    let err = 0
    for (let k = 0; k < 4; k++) err += weights[k] * ((v[k] - goal[k]) / scale[k]) ** 2
    if (opts.lowSalt) err += 0.5 * (Math.max(0, t[IDX.sodium] - SALT_LIMIT_MG) / SALT_LIMIT_MG) ** 2
    if (opts.highFiber) err += 0.4 * (Math.max(0, FIBER_GOAL_G - t[IDX.fiber]) / FIBER_GOAL_G) ** 2
    // niewielka kara za oddalanie się od oryginału — przepis ma pozostać sobą
    for (const i of free) err += 0.02 * Math.log(m[i]) ** 2
    return err
  }

  const grid: number[] = []
  for (let g = MIN_FACTOR; g <= MAX_FACTOR + 1e-9; g += GRID) grid.push(Math.round(g * 100) / 100)

  let best = objective()
  for (let sweep = 0; sweep < SWEEPS; sweep++) {
    let improved = false
    for (const i of free) {
      let bestM = m[i]
      for (const g of grid) {
        m[i] = g
        const o = objective()
        if (o < best - 1e-9) {
          best = o
          bestM = g
          improved = true
        }
      }
      m[i] = bestM
    }
    if (!improved) break
  }
  return m.map((v, i) => (free.includes(i) ? v : undefined))
}
