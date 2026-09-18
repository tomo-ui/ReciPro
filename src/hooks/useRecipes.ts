import { useCallback, useEffect, useState } from 'react'
import type { Recipe, RecipeDraft } from '@/types/recipe'
import { localRepository } from '@/lib/localRepository'
import { isSupabaseConfigured } from '@/lib/supabase'
import { supabaseRepository } from '@/lib/supabaseRepository'

// Jedyne miejsce, w którym wybieramy backend
const repo = isSupabaseConfigured ? supabaseRepository : localRepository

export function useRecipes() {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setRecipes(await repo.list())
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
    const created = await repo.add(draft)
    setRecipes((prev) => [created, ...prev])
    return created
  }, [])

  const remove = useCallback(async (id: string) => {
    await repo.remove(id)
    setRecipes((prev) => prev.filter((r) => r.id !== id))
  }, [])

  return { recipes, loading, error, reload: load, add, remove }
}
