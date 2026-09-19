import { useCallback, useEffect, useRef, useState } from 'react'
import type { RecipeStats } from '@/types/recipe'
import { backend } from '@/lib/data'

const BATCH = 100 // tyle identyfikatorów przyjmuje recipe_stats naraz

/**
 * Polubienia i komentarze dla listy przepisów: dociąga statystyki tylko dla nowych identyfikatorów
 * (jednym zapytaniem na paczkę) i pozwala lokalnie zmieniać wartości po polubieniu/komentarzu.
 */
export function useRecipeStats(recipes: { id: string }[]) {
  const [stats, setStats] = useState<Record<string, RecipeStats>>({})
  const requested = useRef(new Set<string>())
  const key = recipes.map((r) => r.id).join(',')

  useEffect(() => {
    const missing = recipes.map((r) => r.id).filter((id) => !requested.current.has(id))
    if (missing.length === 0) return
    for (const id of missing) requested.current.add(id)
    for (let i = 0; i < missing.length; i += BATCH) {
      const chunk = missing.slice(i, i + BATCH)
      backend
        .getRecipeStats(chunk)
        .then((res) => setStats((s) => ({ ...s, ...res })))
        .catch(() => chunk.forEach((id) => requested.current.delete(id))) // spróbujemy przy następnej zmianie listy
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const idsRef = useRef<string[]>([])
  idsRef.current = recipes.map((r) => r.id)
  /** Pobiera statystyki widocznych przepisów od nowa (np. po dodaniu komentarza na ekranie szczegółów) */
  const refresh = useCallback(() => {
    const ids = idsRef.current.slice(0, BATCH)
    if (ids.length === 0) return
    backend
      .getRecipeStats(ids)
      .then((res) => setStats((s) => ({ ...s, ...res })))
      .catch(() => {})
  }, [])

  const update = useCallback(
    (id: string, change: (s: RecipeStats) => RecipeStats) =>
      setStats((s) => (s[id] ? { ...s, [id]: change(s[id]) } : s)),
    [],
  )
  const set = useCallback((id: string, value: RecipeStats) => setStats((s) => ({ ...s, [id]: value })), [])

  return { stats, update, set, refresh }
}
