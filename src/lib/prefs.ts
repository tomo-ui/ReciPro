/**
 * Cele żywieniowe użytkownika (kalorie, makroskładniki) — trzymane w przeglądarce, na tym urządzeniu.
 * Służą do dopasowania przepisu do jednego posiłku (patrz adapt.ts).
 */

export type MacroPreset = 'balanced' | 'highprotein' | 'lowcarb' | 'lowfat' | 'custom'

export interface Prefs {
  kcalPerDay: number
  mealsPerDay: number
  preset: MacroPreset
  /** Udział kalorii w procentach (suma 100); dla gotowych zestawów ustawiany z PRESETS */
  protein: number
  fat: number
  carbs: number
  lowSalt: boolean
  highFiber: boolean
}

export const PRESETS: Record<Exclude<MacroPreset, 'custom'>, { label: string; protein: number; fat: number; carbs: number }> = {
  balanced: { label: 'Zbilansowana', protein: 20, fat: 30, carbs: 50 },
  highprotein: { label: 'Więcej białka', protein: 30, fat: 30, carbs: 40 },
  lowcarb: { label: 'Mniej węglowodanów', protein: 25, fat: 45, carbs: 30 },
  lowfat: { label: 'Mniej tłuszczu', protein: 20, fat: 20, carbs: 60 },
}

export const DEFAULT_PREFS: Prefs = {
  kcalPerDay: 2000,
  mealsPerDay: 4,
  preset: 'balanced',
  protein: PRESETS.balanced.protein,
  fat: PRESETS.balanced.fat,
  carbs: PRESETS.balanced.carbs,
  lowSalt: false,
  highFiber: false,
}

const KEY = 'przepisy:prefs:v1'

export function loadPrefs(): Prefs {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY)
    if (raw) return sanitize(JSON.parse(raw))
  } catch {
    /* uszkodzone dane — wracamy do domyślnych */
  }
  return DEFAULT_PREFS
}

export function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* pełny storage / tryb prywatny */
  }
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** Naprawia dane z pamięci (typy, zakresy, suma makro = 100) */
export function sanitize(input: Partial<Prefs> | null | undefined): Prefs {
  const p = { ...DEFAULT_PREFS, ...(input ?? {}) }
  const kcalPerDay = Number.isFinite(p.kcalPerDay) ? clamp(Math.round(p.kcalPerDay), 800, 6000) : DEFAULT_PREFS.kcalPerDay
  const mealsPerDay = Number.isFinite(p.mealsPerDay) ? clamp(Math.round(p.mealsPerDay), 1, 8) : DEFAULT_PREFS.mealsPerDay
  const preset: MacroPreset = p.preset in PRESETS || p.preset === 'custom' ? p.preset : 'balanced'
  let { protein, fat, carbs } = preset === 'custom' ? p : PRESETS[preset]
  protein = clamp(Math.round(Number(protein) || 0), 5, 70)
  fat = clamp(Math.round(Number(fat) || 0), 10, 70)
  carbs = clamp(Math.round(Number(carbs) || 0), 5, 80)
  const sum = protein + fat + carbs
  if (sum !== 100) {
    // wyrównujemy proporcjonalnie do 100, żeby cele były spójne
    protein = Math.round((protein / sum) * 100)
    fat = Math.round((fat / sum) * 100)
    carbs = 100 - protein - fat
  }
  return { kcalPerDay, mealsPerDay, preset, protein, fat, carbs, lowSalt: !!p.lowSalt, highFiber: !!p.highFiber }
}

/** Cel na jeden posiłek: kalorie i gramy makroskładników */
export interface MealTarget {
  kcal: number
  protein: number
  fat: number
  carbs: number
}

export function mealTarget(p: Prefs): MealTarget {
  const kcal = p.kcalPerDay / p.mealsPerDay
  return {
    kcal,
    protein: (kcal * p.protein) / 100 / 4,
    fat: (kcal * p.fat) / 100 / 9,
    carbs: (kcal * p.carbs) / 100 / 4,
  }
}
