import type { IngredientLine, RecipeAuthor } from './recipe'

/** Danie w posiłku: składniki na JEDNĄ porcję (kopia z chwili dodania) i liczba zjadanych porcji */
export interface DietItem {
  id: string
  title: string
  /** Przepis, z którego pochodzi danie (może już nie istnieć) */
  recipe_id?: string
  image_url?: string
  /** Składniki jednej porcji */
  lines: IngredientLine[]
  /** Ile porcji jest w diecie (0,5; 1; 1,5…) */
  portions: number
}

export interface DietMeal {
  id: string
  name: string
  /** Jaka część dziennych kalorii przypada na ten posiłek (w procentach, suma wszystkich = 100) */
  share: number
  items: DietItem[]
  /** Id zapisanego szablonu, jeśli ten posiłek już zapisano — blokuje ponowny zapis (bez duplikatów) */
  savedTemplateId?: string
}

/** Cele dzienne */
export interface DietTargets {
  kcalPerDay: number
  /** Udział kalorii z białka, tłuszczu i węglowodanów w procentach (suma 100) */
  protein: number
  fat: number
  carbs: number
  preset: 'balanced' | 'highprotein' | 'lowcarb' | 'lowfat' | 'custom'
  lowSalt: boolean
  highFiber: boolean
}

/** Od kogo pochodzi kopia diety */
export interface DietSource {
  diet_id: string
  user_id: string
  username: string
  title: string
}

export interface Diet {
  id: string
  user_id: string
  title: string
  description?: string
  meals: DietMeal[]
  targets: DietTargets
  /** Widoczna dla innych na profilu autora */
  is_public: boolean
  source?: DietSource
  created_at: string
  updated_at: string
  /** Autor (przy dietach oglądanych na cudzym profilu) */
  author?: RecipeAuthor
}

/** Dieta do zapisu: bez pól nadawanych przez bazę; `id` brak = nowa */
export type DietDraft = Omit<Diet, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'author'> & { id?: string }

/** Zestaw dań (np. stałe śniadanie) zapisany do wielokrotnego wstawiania w przyszłych dietach */
export interface MealTemplate {
  id: string
  user_id: string
  name: string
  items: DietItem[]
  created_at: string
}

/** Szablon posiłku do zapisu: bez pól nadawanych przez bazę; `id` brak = nowy */
export type MealTemplateDraft = Omit<MealTemplate, 'id' | 'user_id' | 'created_at'> & { id?: string }
