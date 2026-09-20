import { useEffect, useMemo, useState } from 'react'
import type { IngredientLine } from '@/types/recipe'
import { loadFoodDb, type FoodDb } from '@/lib/foodDb'
import { analyzeRecipe, type RecipeNutrition } from '@/lib/nutrition'

/** Baza składników ładuje się raz i leniwie (osobny fragment aplikacji); do tego czasu zwraca null */
export function useFoodDb(): FoodDb | null {
  const [db, setDb] = useState<FoodDb | null>(null)
  useEffect(() => {
    let alive = true
    loadFoodDb()
      .then((d) => alive && setDb(d))
      .catch(() => {
        /* bez bazy aplikacja działa dalej, tylko bez wartości odżywczych */
      })
    return () => {
      alive = false
    }
  }, [])
  return db
}

/** Wartości odżywcze przepisu liczone lokalnie; null, dopóki baza się nie wczyta */
export function useRecipeNutrition(ingredients: IngredientLine[], servings?: number): RecipeNutrition | null {
  const db = useFoodDb()
  return useMemo(() => (db ? analyzeRecipe(ingredients, db, servings) : null), [db, ingredients, servings])
}
