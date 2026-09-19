import type {
  AppNotification,
  Comment,
  Profile,
  ProfileCounts,
  ProfileSummary,
  Recipe,
  RecipeAuthor,
  RecipeDraft,
  RecipeStats,
} from '@/types/recipe'

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
  /** Adres nowego zdjęcia profilowego; null usuwa zdjęcie */
  avatar_url?: string | null
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
  /** Obserwujący / obserwowani danego profilu, od najnowszych (profil prywatny: tylko dla właściciela) */
  listFollowers(username: string, offset: number, limit: number): Promise<ProfileSummary[]>
  listFollowing(username: string, offset: number, limit: number): Promise<ProfileSummary[]>
  /** Nasłuchuje zmian liczników profilu na żywo. Zwraca funkcję kończącą nasłuchiwanie. */
  subscribeProfileCounts(userId: string, onCounts: (counts: ProfileCounts) => void): () => void

  /* — aktywność (powiadomienia) — */
  /** Polubienia, komentarze i nowi obserwujący, od najnowszych */
  listNotifications(offset: number, limit: number): Promise<AppNotification[]>
  countUnreadNotifications(): Promise<number>
  markNotificationsRead(): Promise<void>
  /** Wywołuje `onNew` na żywo, gdy pojawi się nowe powiadomienie. Zwraca funkcję kończącą nasłuchiwanie. */
  subscribeNotifications(userId: string, onNew: () => void): () => void
  /** Przepis po id (widoczny dla zalogowanego) albo null */
  getRecipe(id: string): Promise<Recipe | null>

  /* — odkrywanie — */
  searchRecipes(query: string, sort: RecipeSort, offset: number, limit: number): Promise<Recipe[]>
  feed(mode: FeedMode, seed: string, offset: number, limit: number): Promise<Recipe[]>
  popularTags(limit: number): Promise<{ tag: string; uses: number }[]>

  /* — polubienia i komentarze — */
  getRecipeStats(ids: string[]): Promise<Record<string, RecipeStats>>
  likeRecipe(recipeId: string): Promise<void>
  unlikeRecipe(recipeId: string): Promise<void>
  listComments(recipeId: string, offset: number, limit: number): Promise<Comment[]>
  /** `author` to zalogowany użytkownik — potrzebny, żeby od razu pokazać nowy komentarz */
  addComment(recipeId: string, body: string, author: RecipeAuthor): Promise<Comment>
  deleteComment(comment: Comment): Promise<void>
}
