import type { Profile, ProfileSummary, Recipe, RecipeDraft } from '@/types/recipe'

/**
 * Wszystko, czego aplikacja potrzebuje od danych. UI zna tylko ten interfejs —
 * implementacje: supabaseBackend (produkcja) i localBackend (bez Supabase / tryb demo).
 */

export type FeedMode = 'random' | 'newest'
export type RecipeSort = 'relevance' | 'newest'

export interface ProfilePatch {
  username?: string
  full_name?: string | null
  is_public?: boolean
}

export interface Backend {
  /** true = konta i dane w Supabase; false = tryb lokalny (dane w przeglądarce, przykładowi użytkownicy) */
  remote: boolean

  /* — moje przepisy — */
  listMyRecipes(): Promise<Recipe[]>
  addRecipe(draft: RecipeDraft): Promise<Recipe>
  updateRecipe(id: string, draft: RecipeDraft): Promise<Recipe>
  /** Usuwa przepis razem z jego zdjęciem (jeśli jest nasze), żeby nie zajmowało miejsca */
  removeRecipe(recipe: Recipe): Promise<void>

  /* — profile — */
  getMyProfile(): Promise<Profile | null>
  createProfile(username: string, fullName?: string): Promise<Profile>
  updateProfile(patch: ProfilePatch): Promise<Profile>
  usernameAvailable(username: string): Promise<boolean>
  getProfile(username: string): Promise<ProfileSummary | null>
  profileRecipes(profile: Profile, offset: number, limit: number): Promise<Recipe[]>
  searchProfiles(query: string, offset: number, limit: number): Promise<ProfileSummary[]>
  follow(userId: string): Promise<void>
  unfollow(userId: string): Promise<void>

  /* — odkrywanie — */
  searchRecipes(query: string, sort: RecipeSort, offset: number, limit: number): Promise<Recipe[]>
  feed(mode: FeedMode, seed: string, offset: number, limit: number): Promise<Recipe[]>
  popularTags(limit: number): Promise<{ tag: string; uses: number }[]>
}
