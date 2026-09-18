import type { Recipe, RecipeDraft } from '@/types/recipe'

/**
 * Warstwa dostępu do danych. UI zna tylko ten interfejs —
 * w kolejnym kroku podmienimy localRepository na Supabase bez ruszania ekranów.
 */
export interface RecipeRepository {
  list(): Promise<Recipe[]>
  add(draft: RecipeDraft): Promise<Recipe>
  remove(id: string): Promise<void>
}
