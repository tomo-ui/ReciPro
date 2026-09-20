/**
 * Składniki odżywcze w bazie (kolejność = indeks w tablicy `n` każdego produktu; wartości na 100 g)
 * wraz z referencyjnymi dawkami dziennymi (RWS według rozporządzenia UE 1169/2011 i zaleceń WHO).
 */

export type NutrientKey =
  | 'kcal' | 'protein' | 'fat' | 'carbs' | 'sugars' | 'fiber' | 'satfat' | 'sodium' | 'cholesterol'
  | 'calcium' | 'iron' | 'magnesium' | 'potassium' | 'zinc' | 'phosphorus' | 'selenium'
  | 'vitA' | 'vitC' | 'vitD' | 'vitE' | 'vitK' | 'vitB12' | 'vitB6' | 'folate'

export interface NutrientInfo {
  key: NutrientKey
  label: string
  unit: 'kcal' | 'g' | 'mg' | 'µg'
  /** Dawka dzienna (100% RWS); dla sodu i nasyconych to raczej limit */
  daily?: number
  /** true = to limit, którego lepiej nie przekraczać (sód, tłuszcze nasycone, cukry) */
  limit?: boolean
}

export const NUTRIENTS: NutrientInfo[] = [
  { key: 'kcal', label: 'Energia', unit: 'kcal', daily: 2000 },
  { key: 'protein', label: 'Białko', unit: 'g', daily: 50 },
  { key: 'fat', label: 'Tłuszcz', unit: 'g', daily: 70 },
  { key: 'carbs', label: 'Węglowodany', unit: 'g', daily: 260 },
  { key: 'sugars', label: 'Cukry', unit: 'g', daily: 90, limit: true },
  { key: 'fiber', label: 'Błonnik', unit: 'g', daily: 25 },
  { key: 'satfat', label: 'Tłuszcze nasycone', unit: 'g', daily: 20, limit: true },
  { key: 'sodium', label: 'Sód', unit: 'mg', daily: 2000, limit: true },
  { key: 'cholesterol', label: 'Cholesterol', unit: 'mg', daily: 300, limit: true },
  { key: 'calcium', label: 'Wapń', unit: 'mg', daily: 800 },
  { key: 'iron', label: 'Żelazo', unit: 'mg', daily: 14 },
  { key: 'magnesium', label: 'Magnez', unit: 'mg', daily: 375 },
  { key: 'potassium', label: 'Potas', unit: 'mg', daily: 2000 },
  { key: 'zinc', label: 'Cynk', unit: 'mg', daily: 10 },
  { key: 'phosphorus', label: 'Fosfor', unit: 'mg', daily: 700 },
  { key: 'selenium', label: 'Selen', unit: 'µg', daily: 55 },
  { key: 'vitA', label: 'Witamina A', unit: 'µg', daily: 800 },
  { key: 'vitC', label: 'Witamina C', unit: 'mg', daily: 80 },
  { key: 'vitD', label: 'Witamina D', unit: 'µg', daily: 5 },
  { key: 'vitE', label: 'Witamina E', unit: 'mg', daily: 12 },
  { key: 'vitK', label: 'Witamina K', unit: 'µg', daily: 75 },
  { key: 'vitB12', label: 'Witamina B12', unit: 'µg', daily: 2.5 },
  { key: 'vitB6', label: 'Witamina B6', unit: 'mg', daily: 1.4 },
  { key: 'folate', label: 'Kwas foliowy', unit: 'µg', daily: 200 },
]

export const NUTRIENT_COUNT = NUTRIENTS.length

export const IDX = Object.fromEntries(NUTRIENTS.map((n, i) => [n.key, i])) as Record<NutrientKey, number>

/** Mikroskładniki pokazywane osobno (witaminy i minerały) */
export const MICROS: NutrientKey[] = [
  'calcium', 'iron', 'magnesium', 'potassium', 'zinc', 'phosphorus', 'selenium',
  'vitA', 'vitC', 'vitD', 'vitE', 'vitK', 'vitB12', 'vitB6', 'folate',
]

/** Wartości odżywcze: tablica w kolejności NUTRIENTS */
export type Nutrients = number[]

export const zeroNutrients = (): Nutrients => new Array(NUTRIENT_COUNT).fill(0)

export function addScaled(into: Nutrients, per100: readonly number[], grams: number): void {
  const k = grams / 100
  for (let i = 0; i < NUTRIENT_COUNT; i++) into[i] += (per100[i] ?? 0) * k
}

export const scaleNutrients = (n: Nutrients, k: number): Nutrients => n.map((v) => v * k)

/** Sól (g) z sodu (mg): sól = sód × 2,5 */
export const saltGrams = (sodiumMg: number) => (sodiumMg * 2.5) / 1000

/** Udział kalorii z białka, tłuszczu i węglowodanów (w procentach, suma ≈ 100) */
export function macroShares(n: Nutrients): { protein: number; fat: number; carbs: number } {
  const p = n[IDX.protein] * 4
  const f = n[IDX.fat] * 9
  const c = n[IDX.carbs] * 4
  const sum = p + f + c
  if (sum <= 0) return { protein: 0, fat: 0, carbs: 0 }
  return { protein: (p / sum) * 100, fat: (f / sum) * 100, carbs: (c / sum) * 100 }
}

/** Liczba do wyświetlenia: całkowite dla dużych wartości, jeden lub dwa miejsca po przecinku dla małych */
export function formatAmount(v: number): string {
  if (!Number.isFinite(v)) return '–'
  if (v === 0) return '0'
  const a = Math.abs(v)
  const digits = a >= 100 ? 0 : a >= 10 ? 0 : a >= 1 ? 1 : 2
  return v.toFixed(digits).replace('.', ',')
}

export function formatNutrient(key: NutrientKey, v: number): string {
  const info = NUTRIENTS[IDX[key]]
  return `${formatAmount(v)} ${info.unit}`
}
