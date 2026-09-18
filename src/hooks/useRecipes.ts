import { useCallback, useEffect, useState } from 'react'
import type { Recipe, RecipeDraft } from '@/types/recipe'
import { backend } from '@/lib/data'

/** Moje przepisy: lista oraz dodawanie, edycja i usuwanie (razem ze zdjęciem) */
export function useRecipes() {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setRecipes(await backend.listMyRecipes())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się wczytać przepisów.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const add = useCallback(async (draft: RecipeDraft) => {
    const created = await backend.addRecipe(draft)
    setRecipes((prev) => [created, ...prev])
    return created
  }, [])

  const update = useCallback(async (id: string, draft: RecipeDraft) => {
    const updated = await backend.updateRecipe(id, draft)
    setRecipes((prev) => prev.map((r) => (r.id === id ? updated : r)))
    return updated
  }, [])

  const remove = useCallback(async (recipe: Recipe) => {
    await backend.removeRecipe(recipe)
    setRecipes((prev) => prev.filter((r) => r.id !== recipe.id))
  }, [])

  return { recipes, loading, error, reload: load, add, update, remove }
}
