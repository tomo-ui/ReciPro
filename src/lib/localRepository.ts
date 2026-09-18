import type { Recipe, RecipeDraft } from '@/types/recipe'
import type { RecipeRepository } from './repository'
import { seedRecipes } from './seed'

const KEY = 'przepisy:v1'

function read(): Recipe[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as Recipe[]
  } catch {
    /* uszkodzone dane lub brak dostępu — startujemy od seeda */
  }
  return seedRecipes()
}

function write(recipes: Recipe[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(recipes))
  } catch {
    /* tryb prywatny / pełny storage — zmiany żyją tylko w pamięci */
  }
}

/** Tymczasowa implementacja na localStorage — do czasu podpięcia Supabase */
export const localRepository: RecipeRepository = {
  async list() {
    return read().sort((a, b) => b.created_at.localeCompare(a.created_at))
  },

  async add(draft: RecipeDraft) {
    const now = new Date().toISOString()
    const recipe: Recipe = { ...draft, id: crypto.randomUUID(), created_at: now, updated_at: now }
    write([recipe, ...read()])
    return recipe
  },

  async remove(id: string) {
    write(read().filter((r) => r.id !== id))
  },
}
