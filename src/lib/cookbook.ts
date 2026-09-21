import type { Recipe, RecipeDraft } from '@/types/recipe'
import { usesSupabase } from './data'
import { uploadRecipeImage } from './images'

/** Post (profil, feed) kontra wpis tylko w książce kucharskiej; starsze przepisy bez pola są postami */
export const isPostRecipe = (r: Pick<Recipe, 'is_post'>): boolean => r.is_post !== false

/** Zapisany cudzy przepis (ma oznaczenie autora oryginału) */
export const isSavedRecipe = (r: Pick<Recipe, 'saved_from'>): boolean => !!r.saved_from

/**
 * Szkic kopii cudzego przepisu do mojej książki kucharskiej, z oznaczeniem autora oryginału.
 * Zdjęcie kopiujemy do własnego folderu, żeby kopia nie straciła obrazka, gdy autor usunie swój przepis;
 * gdy się nie uda, zostaje adres oryginału. `ownImage` = czy zdjęcie zostało przez nas wysłane (trzeba je posprzątać przy błędzie).
 */
export async function draftForSaving(r: Recipe): Promise<{ draft: RecipeDraft; ownImage: boolean }> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, created_at, updated_at, user_id, author, saved_from, is_post, ...rest } = r
  let image_url = r.image_url
  let ownImage = false
  if (image_url && usesSupabase) {
    try {
      const res = await fetch(image_url)
      if (res.ok) {
        image_url = await uploadRecipeImage(await res.blob(), 'saved-')
        ownImage = true
      }
    } catch {
      /* zostaje adres oryginału */
    }
  }
  return {
    draft: { ...rest, image_url, is_post: false, saved_from: { user_id: r.user_id, username: r.author?.username ?? '', recipe_id: r.id } },
    ownImage,
  }
}
