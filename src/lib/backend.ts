import type { Diet, DietDraft, MealTemplate, MealTemplateDraft } from '@/types/diet'
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

/** `foryou` = Dla Ciebie (polecane wg zainteresowań i polubień + obserwowani), `newest` = chronologicznie obserwowani */
export type FeedMode = 'foryou' | 'newest'
export type RecipeSort = 'relevance' | 'newest'

export interface ProfilePatch {
  username?: string
  full_name?: string | null
  /** Opis profilu; null lub pusty tekst usuwa opis */
  bio?: string | null
  /** Czy inni mogą powiększyć zdjęcie profilowe */
  allow_avatar_zoom?: boolean
  is_public?: boolean
  /** Adres nowego zdjęcia profilowego; null usuwa zdjęcie */
  avatar_url?: string | null
}

/** Ustawienia panelu admina; tylko dla administratora (konto twórcy) */
export interface AdminSettings {
  /** Czy konta testowe są widoczne dla tego admina (tylko on je widzi) */
  show_test_accounts: boolean
  /** Ile kont testowych jest w bazie, niezależnie od widoczności */
  test_accounts: number
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

  /* — diety — */
  /** Własne diety (wszystkie) albo diety innej osoby (tylko udostępnione), od ostatnio zmienianej */
  listDiets(username: string): Promise<Diet[]>
  getDiet(id: string): Promise<Diet | null>
  /** Bez `id` tworzy nową dietę, z `id` zapisuje zmiany we własnej */
  saveDiet(diet: DietDraft): Promise<Diet>
  deleteDiet(id: string): Promise<void>

  /* — zapisane posiłki (np. stałe śniadanie, do wstawienia w przyszłych dietach) — */
  /** Moje zapisane posiłki, od ostatnio dodanego */
  listMealTemplates(): Promise<MealTemplate[]>
  /** Bez `id` tworzy nowy szablon, z `id` zapisuje zmiany we własnym */
  saveMealTemplate(template: MealTemplateDraft): Promise<MealTemplate>
  deleteMealTemplate(id: string): Promise<void>

  /* — odkrywanie — */
  searchRecipes(query: string, sort: RecipeSort, offset: number, limit: number): Promise<Recipe[]>
  feed(mode: FeedMode, seed: string, offset: number, limit: number): Promise<Recipe[]>
  popularTags(limit: number): Promise<{ tag: string; uses: number }[]>
  /** Zapisuje wyświetlenie przepisu (raz na osobę) — do rankingu popularności */
  recordView(recipeId: string): Promise<void>
  /** Najpopularniejsze przepisy z ostatnich 14 dni (pasek nad feedem, jak Instastories) */
  trending(limit: number): Promise<Recipe[]>

  /* — panel admina — */
  /** null = zwykły użytkownik (bez panelu admina) */
  getAdminSettings(): Promise<AdminSettings | null>
  /** Włącza/wyłącza widoczność kont testowych (tylko dla siebie jako admina) */
  setShowTestAccounts(show: boolean): Promise<void>

  /* — zainteresowania (prywatne; kształtują feed Dla Ciebie) — */
  getInterests(): Promise<string[]>
  /** Zapisuje listę po normalizacji i zwraca ją w zapisanej postaci */
  setInterests(list: string[]): Promise<string[]>

  /* — polubienia i komentarze — */
  getRecipeStats(ids: string[]): Promise<Record<string, RecipeStats>>
  likeRecipe(recipeId: string): Promise<void>
  unlikeRecipe(recipeId: string): Promise<void>
  listComments(recipeId: string, offset: number, limit: number): Promise<Comment[]>
  /** `author` to zalogowany użytkownik — potrzebny, żeby od razu pokazać nowy komentarz */
  addComment(recipeId: string, body: string, author: RecipeAuthor): Promise<Comment>
  deleteComment(comment: Comment): Promise<void>
}
