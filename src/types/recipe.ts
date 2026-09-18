/**
 * Jeden zunifikowany format przepisu — używany przez UI, wszystkie warstwy
 * parsowania (JSON-LD / heurystyki / Gemini) oraz tabelę `recipes` w Supabase.
 * Wszystko, co wchodzi do bazy, MUSI przejść przez ten kształt.
 */

export type ParseMethod = 'manual' | 'json-ld' | 'heuristic' | 'gemini'

/** Skąd pochodzi zaimportowany przepis (tylko informacja dla UI, nie trafia do bazy) */
export type ParseOrigin = 'page' | 'tiktok-caption'

export interface IngredientLine {
  /** Pełny tekst linii, np. "2 łyżki oliwy z oliwek" — źródło prawdy dla UI */
  text: string
  /** Opcjonalna sekcja, np. "Ciasto", "Sos" */
  group?: string
}

export interface StepLine {
  text: string
  group?: string
}

export interface Recipe {
  id: string
  title: string
  description?: string
  image_url?: string
  /** Oryginalny link, jeśli przepis został zaimportowany */
  source_url?: string
  servings?: number
  prep_minutes?: number
  cook_minutes?: number
  total_minutes?: number
  ingredients: IngredientLine[]
  steps: StepLine[]
  tags: string[]
  parse_method: ParseMethod
  created_at: string // ISO 8601
  updated_at: string // ISO 8601
}

/** To, co produkuje parser lub formularz — id i timestampy nadaje repozytorium */
export type RecipeDraft = Omit<Recipe, 'id' | 'created_at' | 'updated_at'>

export const emptyDraft = (): RecipeDraft => ({
  title: '',
  ingredients: [],
  steps: [],
  tags: [],
  parse_method: 'manual',
})
