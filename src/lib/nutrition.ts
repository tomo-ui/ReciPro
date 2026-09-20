import type { IngredientLine } from '@/types/recipe'
import { parseIngredient, pieceWeightOf, type ParsedIngredient } from './ingredients'
import type { Food, FoodDb } from './foodDb'
import { IDX, NUTRIENT_COUNT, addScaled, scaleNutrients, zeroNutrients, type Nutrients } from './nutrients'

/**
 * Szacowanie wartości odżywczych przepisu z lokalnej bazy składników (bez sieci).
 * Każda linia: ilość → gramy → wartości z produktu z bazy. Wartości dotyczą produktów w stanie z linii
 * (najczęściej surowych), bez strat i przyrostów przy obróbce — to szacunek, nie pomiar.
 */

export type LineStatus = 'ok' | 'no-amount' | 'no-match' | 'no-weight'

export interface LineAnalysis {
  text: string
  group?: string
  parsed: ParsedIngredient
  food?: Food
  /** true, gdy produkt wskazał użytkownik (food_id), a nie automat */
  manual: boolean
  grams?: number
  /** Wartości dla tej linii (już przeliczone na gramy); null, gdy nie dało się policzyć */
  nutrients: Nutrients | null
  status: LineStatus
  /** Czy gramaturę da się zmieniać mechanicznie (linia zapisana w g lub ml) */
  adjustable: boolean
}

export interface RecipeNutrition {
  lines: LineAnalysis[]
  /** Suma dla całego przepisu */
  total: Nutrients
  /** Na jedną porcję (jeśli podano liczbę porcji) */
  perServing: Nutrients | null
  servings?: number
  /** Ile linii z ilością udało się policzyć */
  counted: number
  /** Ile linii ma określoną ilość (bez „do smaku”) */
  withAmount: number
  totalGrams: number
}

const ML_G_FALLBACK = 1 // g na ml, gdy baza nie zna gęstości

/** Gęstość produktu (g/ml) z wagi szklanki; brak = 1 */
export function densityOf(food: Food): number {
  return food.p.c ? food.p.c / 236.6 : ML_G_FALLBACK
}

/** Ile gramów to `value` sztuk/miar danego produktu (null = nie umiemy ocenić) */
function pieceGrams(parsed: ParsedIngredient, food: Food | undefined): number | undefined {
  const word = (parsed.unitWord ?? '').toLowerCase()
  const name = parsed.name.toLowerCase()
  const p = food?.p ?? {}
  if (/puszk/.test(word)) return p.cn ?? 400
  if (/plaster|kromk/.test(word)) return p.sl ?? 25
  if (/ząbk|zabk/.test(word) || /ząbek|ząbk/.test(name)) return p.cl ?? 5
  if (/szczypt/.test(word)) return 0.4
  if (/garś|garsc/.test(word)) return 30
  if (/opakowan|kostk|pęcz|pecz|główk|glowk|łodyg|gałąz|galaz|listk|liść|lisc/.test(word)) return undefined
  return pieceWeightOf(name) ?? p.pc ?? undefined
}

export function analyzeLine(line: IngredientLine, db: FoodDb): LineAnalysis {
  const parsed = parseIngredient(line.text)
  const manualFood = line.food_id !== undefined ? db.byId.get(line.food_id) : undefined
  const base = { text: line.text, group: line.group, parsed, manual: !!manualFood, adjustable: parsed.kind === 'g' || parsed.kind === 'ml' }

  if (parsed.kind === undefined || parsed.value === undefined) {
    return { ...base, food: manualFood ?? db.match(parsed.name), nutrients: null, status: 'no-amount' }
  }
  const food = manualFood ?? db.match(parsed.name)
  if (!food) return { ...base, nutrients: null, status: 'no-match' }

  let grams: number | undefined
  if (parsed.kind === 'g') grams = parsed.value
  else if (parsed.kind === 'ml') grams = parsed.value * densityOf(food)
  else {
    const each = pieceGrams(parsed, food)
    grams = each === undefined ? undefined : each * parsed.value
  }
  if (grams === undefined) return { ...base, food, nutrients: null, status: 'no-weight' }

  const n = zeroNutrients()
  addScaled(n, food.n, grams)
  return { ...base, food, grams, nutrients: n, status: 'ok' }
}

export function analyzeRecipe(ingredients: IngredientLine[], db: FoodDb, servings?: number): RecipeNutrition {
  const lines = ingredients.map((l) => analyzeLine(l, db))
  const total = zeroNutrients()
  let totalGrams = 0
  for (const l of lines) {
    if (!l.nutrients) continue
    for (let i = 0; i < NUTRIENT_COUNT; i++) total[i] += l.nutrients[i]
    totalGrams += l.grams ?? 0
  }
  const s = servings && servings > 0 ? servings : undefined
  return {
    lines,
    total,
    perServing: s ? scaleNutrients(total, 1 / s) : null,
    servings: s,
    counted: lines.filter((l) => l.status === 'ok').length,
    withAmount: lines.filter((l) => l.status !== 'no-amount').length,
    totalGrams,
  }
}

/** Kalorie na porcję (do znaczka na karcie); null, gdy za mało danych, żeby cokolwiek podać */
export function kcalPerServing(r: RecipeNutrition): number | null {
  if (r.withAmount === 0 || r.counted / r.withAmount < 0.5) return null
  const kcal = (r.perServing ?? r.total)[IDX.kcal]
  return kcal > 0 ? Math.round(kcal) : null
}

/** Nazwa linii bez ilości, np. do wyświetlenia w zestawieniu składników */
export const lineName = (l: LineAnalysis) => l.parsed.name || l.text

/**
 * Podmienia ilość na początku linii zapisanej w g lub ml („200 g mąki” → „150 g mąki”).
 * Linia z inną jednostką (sztuki, „do smaku”) zostaje bez zmian.
 */
export function withAmount(text: string, amount: number): string {
  const parsed = parseIngredient(text)
  if (parsed.kind !== 'g' && parsed.kind !== 'ml') return text
  const big = amount >= 1000
  const value = big ? amount / 1000 : amount
  const unit = parsed.kind === 'g' ? (big ? 'kg' : 'g') : big ? 'l' : 'ml'
  const shown = String(round(value, big ? 2 : amount < 10 ? 1 : 0)).replace('.', ',')
  return `${shown} ${unit} ${parsed.name}`.trim()
}

const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits
