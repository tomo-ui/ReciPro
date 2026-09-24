import type { Recipe } from '@/types/recipe'
import type { Diet, DietDraft, DietItem, DietMeal, DietSource, DietTargets, MealTemplate, MealTemplateDraft } from '@/types/diet'
import type { Food, FoodDb } from './foodDb'
import { NUTRIENT_COUNT, scaleNutrients, zeroNutrients, type Nutrients } from './nutrients'
import { analyzeRecipe, withAmount } from './nutrition'
import { DEFAULT_PREFS, PRESETS, type MealTarget, type Prefs } from './prefs'
import { scaleIngredient } from './scale'
import { shortName } from './foodDb'

/**
 * Dieta = posiłki z daniami. Każde danie trzyma składniki jednej porcji i liczbę porcji,
 * więc wartości odżywcze to suma po składnikach × porcje, liczona lokalnie z bazy składników.
 */

const id = () => crypto.randomUUID()

/* — posiłki — */

const MEAL_NAMES: Record<number, string[]> = {
  1: ['Posiłek'],
  2: ['Śniadanie', 'Obiad'],
  3: ['Śniadanie', 'Obiad', 'Kolacja'],
  4: ['Śniadanie', 'Obiad', 'Podwieczorek', 'Kolacja'],
  5: ['Śniadanie', 'II śniadanie', 'Obiad', 'Podwieczorek', 'Kolacja'],
  6: ['Śniadanie', 'II śniadanie', 'Obiad', 'Podwieczorek', 'Kolacja', 'Przekąska'],
}
const MEAL_SHARES: Record<number, number[]> = {
  1: [100],
  2: [40, 60],
  3: [30, 45, 25],
  4: [25, 35, 15, 25],
  5: [25, 10, 30, 10, 25],
  6: [22, 10, 30, 10, 20, 8],
}
export const MAX_MEALS = 8

/** Nazwy i udziały kalorii dla wybranej liczby posiłków (więcej niż 6: równo) */
export function mealLayout(count: number): { name: string; share: number }[] {
  const n = Math.min(MAX_MEALS, Math.max(1, Math.round(count)))
  const names = MEAL_NAMES[n] ?? Array.from({ length: n }, (_, i) => `Posiłek ${i + 1}`)
  const shares = MEAL_SHARES[n] ?? equalShares(n)
  return names.map((name, i) => ({ name, share: shares[i] }))
}

export function equalShares(n: number): number[] {
  const base = Math.floor(100 / n)
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? 100 - base * (n - 1) : base))
}

/** Doprowadza udziały do sumy 100 (proporcjonalnie), każdy co najmniej 1 */
export function normalizeShares(meals: DietMeal[]): DietMeal[] {
  if (meals.length === 0) return meals
  const sum = meals.reduce((a, m) => a + Math.max(0, m.share), 0)
  if (sum <= 0) return meals.map((m, i) => ({ ...m, share: equalShares(meals.length)[i] }))
  const scaled = meals.map((m) => Math.max(1, Math.round((Math.max(0, m.share) / sum) * 100)))
  const diff = 100 - scaled.reduce((a, b) => a + b, 0)
  scaled[scaled.indexOf(Math.max(...scaled))] += diff // resztę dopisujemy do największego
  return meals.map((m, i) => ({ ...m, share: scaled[i] }))
}

export function newMeals(count: number): DietMeal[] {
  return mealLayout(count).map((m) => ({ id: id(), name: m.name, share: m.share, items: [] }))
}

/* — cele — */

export function targetsFromPrefs(p: Prefs): DietTargets {
  return { kcalPerDay: p.kcalPerDay, protein: p.protein, fat: p.fat, carbs: p.carbs, preset: p.preset, lowSalt: p.lowSalt, highFiber: p.highFiber }
}

export function newDiet(title: string, mealCount: number, prefs: Prefs = DEFAULT_PREFS): DietDraft {
  return { title: title.trim() || 'Nowa dieta', meals: newMeals(mealCount), targets: targetsFromPrefs(prefs), is_public: false }
}

/** Cel dla posiłku: kalorie według udziału i gramy makroskładników według proporcji dziennych */
export function mealTargetOf(targets: DietTargets, share: number): MealTarget {
  const kcal = (targets.kcalPerDay * share) / 100
  return { kcal, protein: (kcal * targets.protein) / 400, fat: (kcal * targets.fat) / 900, carbs: (kcal * targets.carbs) / 400 }
}

export function dayTargetOf(targets: DietTargets): MealTarget {
  return mealTargetOf(targets, 100)
}

/**
 * Zmiana proporcji makro: gotowy zestaw albo własne białko i tłuszcz (węglowodany to reszta do 100%).
 */
export function withMacros(
  targets: DietTargets,
  change: { preset: Exclude<DietTargets['preset'], 'custom'> } | { protein?: number; fat?: number },
): DietTargets {
  if ('preset' in change) {
    const p = PRESETS[change.preset]
    return { ...targets, preset: change.preset, protein: p.protein, fat: p.fat, carbs: p.carbs }
  }
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)))
  const protein = clamp(change.protein ?? targets.protein, 5, 70)
  let fat = clamp(change.fat ?? targets.fat, 10, 70)
  if (100 - protein - fat < 5) fat = 100 - protein - 5 // węglowodany zostają co najmniej na 5%
  return { ...targets, preset: 'custom', protein, fat, carbs: 100 - protein - fat }
}
/* — dania — */

/** Danie z przepisu: składniki jednej porcji (przepis podzielony przez liczbę porcji) */
export function itemFromRecipe(recipe: Pick<Recipe, 'id' | 'title' | 'image_url' | 'servings' | 'ingredients'>): DietItem {
  const factor = 1 / (recipe.servings && recipe.servings > 0 ? recipe.servings : 1)
  return {
    id: id(),
    title: recipe.title,
    recipe_id: recipe.id,
    image_url: recipe.image_url,
    lines: recipe.ingredients.map((l) => ({ ...l, text: scaleIngredient(l.text, factor).text })),
    portions: 1,
  }
}

/** Pojedynczy produkt z bazy jako danie (np. „150 g twaróg”) */
export function itemFromFood(food: Food, grams: number): DietItem {
  const name = shortName(food)
  return { id: id(), title: name.charAt(0).toUpperCase() + name.slice(1), lines: [{ text: `${grams} g ${name}`, food_id: food.id }], portions: 1 }
}

export function itemNutrients(item: DietItem, db: FoodDb): Nutrients {
  return scaleNutrients(analyzeRecipe(item.lines, db).total, item.portions)
}

export function sumNutrients(list: Nutrients[]): Nutrients {
  const t = zeroNutrients()
  for (const n of list) for (let i = 0; i < NUTRIENT_COUNT; i++) t[i] += n[i]
  return t
}

export const mealNutrients = (meal: DietMeal, db: FoodDb): Nutrients => sumNutrients(meal.items.map((i) => itemNutrients(i, db)))

export interface DietAnalysis {
  meals: { meal: DietMeal; total: Nutrients; items: { item: DietItem; n: Nutrients }[] }[]
  day: Nutrients
}

export function analyzeDiet(diet: Pick<Diet, 'meals'>, db: FoodDb): DietAnalysis {
  const meals = diet.meals.map((meal) => {
    const items = meal.items.map((item) => ({ item, n: itemNutrients(item, db) }))
    return { meal, total: sumNutrients(items.map((i) => i.n)), items }
  })
  return { meals, day: sumNutrients(meals.map((m) => m.total)) }
}

/** Zmienia liczbę porcji dania (0,25–20, co 0,25) */
export const withPortions = (item: DietItem, portions: number): DietItem => ({
  ...item,
  portions: Math.min(20, Math.max(0.25, Math.round(portions * 4) / 4)),
})

/** Zmienia gramaturę składnika w g/ml w daniu; linie w innych jednostkach zostają */
export const withLineAmount = (item: DietItem, index: number, amount: number): DietItem => ({
  ...item,
  lines: item.lines.map((l, i) => (i === index ? { ...l, text: withAmount(l.text, amount) } : l)),
})

/* — kopiowanie diety od innej osoby — */

/** Kopia cudzej diety dla siebie: nowe identyfikatory, prywatna, z informacją o źródle (kopia kopii wskazuje pierwotnego autora) */
export function copyDiet(diet: Pick<Diet, 'id' | 'user_id' | 'title' | 'description' | 'meals' | 'targets' | 'source' | 'author'>, fromUsername?: string): DietDraft {
  const source: DietSource = diet.source ?? {
    diet_id: diet.id,
    user_id: diet.user_id,
    username: diet.author?.username ?? fromUsername ?? '',
    title: diet.title,
  }
  return {
    title: diet.title,
    description: diet.description,
    targets: { ...diet.targets },
    is_public: false,
    source,
    meals: diet.meals.map((m) => ({
      ...m,
      id: id(),
      items: m.items.map((it) => ({ ...it, id: id(), lines: it.lines.map((l) => ({ ...l })) })),
      savedTemplateId: undefined, // kopia to inny właściciel — jeszcze nie zapisał tego posiłku jako swojego szablonu
    })),
  }
}

/* — zapisane posiłki (do wielokrotnego użytku) — */

const cloneItems = (items: DietItem[]): DietItem[] => items.map((it) => ({ ...it, id: id(), lines: it.lines.map((l) => ({ ...l })) }))

/** Zestaw dań z posiłku jako szablon do zapisu; świeże identyfikatory, żeby nie dzielić referencji z dietą */
export function templateFromMeal(meal: Pick<DietMeal, 'name' | 'items'>): MealTemplateDraft {
  return { name: meal.name, items: cloneItems(meal.items) }
}

/** Dania z szablonu do wstawienia w posiłku; świeże identyfikatory przy każdym wstawieniu */
export function itemsFromTemplate(template: Pick<MealTemplate, 'items'>): DietItem[] {
  return cloneItems(template.items)
}

/** Uzupełnia brakujące pola dokumentu z bazy (starsze lub ręcznie zmienione dane) */
export function sanitizeMealTemplate<T extends Pick<MealTemplate, 'items'>>(t: T): T {
  return {
    ...t,
    items: (Array.isArray(t.items) ? t.items : []).map((it) => ({
      ...it,
      id: it.id || id(),
      portions: Number.isFinite(it.portions) && it.portions > 0 ? it.portions : 1,
      lines: Array.isArray(it.lines) ? it.lines : [],
    })),
  }
}

/** Uzupełnia brakujące pola dokumentu z bazy (starsze lub ręcznie zmienione dane) */
export function sanitizeDiet<T extends Pick<Diet, 'meals' | 'targets'>>(d: T): T {
  const targets: DietTargets = { ...targetsFromPrefs(DEFAULT_PREFS), ...(d.targets ?? {}) }
  const meals: DietMeal[] = (Array.isArray(d.meals) ? d.meals : []).map((m) => ({
    id: m.id || id(),
    name: m.name || 'Posiłek',
    share: Number.isFinite(m.share) ? m.share : 0,
    items: (Array.isArray(m.items) ? m.items : []).map((it) => ({
      ...it,
      id: it.id || id(),
      portions: Number.isFinite(it.portions) && it.portions > 0 ? it.portions : 1,
      lines: Array.isArray(it.lines) ? it.lines : [],
    })),
    savedTemplateId: m.savedTemplateId,
  }))
  return { ...d, targets, meals: meals.length ? normalizeShares(meals) : meals }
}

