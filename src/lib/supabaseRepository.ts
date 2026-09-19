import type { IngredientLine, ParseMethod, Recipe, RecipeDraft, StepLine } from '@/types/recipe'

/** Wiersz tabeli `recipes` (patrz supabase/schema.sql) */
export interface RecipeRow {
  id: string
  user_id: string
  title: string
  description: string | null
  image_url: string | null
  source_url: string | null
  servings: number | null
  prep_minutes: number | null
  cook_minutes: number | null
  total_minutes: number | null
  ingredients: IngredientLine[]
  steps: StepLine[]
  tags: string[]
  parse_method: ParseMethod
  created_at: string
  updated_at: string
}

/** Wiersz zwracany przez funkcje search_recipes i feed: przepis + autor */
export interface RecipeWithAuthorRow extends RecipeRow {
  author_username: string
  author_full_name: string | null
  author_avatar_url: string | null
}

const orUndef = <T>(v: T | null): T | undefined => v ?? undefined

export function rowToRecipe(r: RecipeRow): Recipe {
  return {
    id: r.id,
    user_id: r.user_id,
    title: r.title,
    description: orUndef(r.description),
    image_url: orUndef(r.image_url),
    source_url: orUndef(r.source_url),
    servings: orUndef(r.servings),
    prep_minutes: orUndef(r.prep_minutes),
    cook_minutes: orUndef(r.cook_minutes),
    total_minutes: orUndef(r.total_minutes),
    ingredients: r.ingredients ?? [],
    steps: r.steps ?? [],
    tags: r.tags ?? [],
    parse_method: r.parse_method,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }
}

export function rowWithAuthorToRecipe(r: RecipeWithAuthorRow): Recipe {
  return {
    ...rowToRecipe(r),
    author: {
      username: r.author_username,
      full_name: orUndef(r.author_full_name),
      avatar_url: orUndef(r.author_avatar_url),
    },
  }
}

/** user_id, id i timestampy nadaje baza (default auth.uid(), gen_random_uuid(), now()) */
export function draftToInsert(d: RecipeDraft) {
  return {
    title: d.title,
    description: d.description ?? null,
    image_url: d.image_url ?? null,
    source_url: d.source_url ?? null,
    servings: d.servings ?? null,
    prep_minutes: d.prep_minutes ?? null,
    cook_minutes: d.cook_minutes ?? null,
    total_minutes: d.total_minutes ?? null,
    ingredients: d.ingredients,
    steps: d.steps,
    tags: d.tags,
    parse_method: d.parse_method,
  }
}
