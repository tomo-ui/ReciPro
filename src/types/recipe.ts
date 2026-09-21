/**
 * Jeden zunifikowany format przepisu — używany przez UI, wszystkie warstwy
 * parsowania (JSON-LD / heurystyki / Gemini) oraz tabelę `recipes` w Supabase.
 * Wszystko, co wchodzi do bazy, MUSI przejść przez ten kształt.
 */

export type ParseMethod = 'manual' | 'json-ld' | 'heuristic' | 'gemini'

/** Skąd pochodzi zaimportowany przepis (tylko informacja dla UI, nie trafia do bazy) */
/** Skąd pochodzi import: strona z przepisem, opis posta/filmu albo strona z linku znalezionego w opisie */
export type ParseOrigin = 'page' | 'tiktok-caption' | 'instagram-caption' | 'youtube-caption' | 'post-link'

/**
 * Co się stało z miniaturką filmu (tylko informacja dla UI):
 * saved = zapisana u nas, temporary = adres tymczasowy (tryb lokalny), none = film jej nie ma,
 * failed = miała, ale nie udało się jej zapisać (powód w `reason`).
 */
export interface ThumbnailInfo {
  status: 'saved' | 'temporary' | 'none' | 'failed'
  reason?: string
}

export interface IngredientLine {
  /** Pełny tekst linii, np. "2 łyżki oliwy z oliwek" — źródło prawdy dla UI */
  text: string
  /** Opcjonalna sekcja, np. "Ciasto", "Sos" */
  group?: string
  /** Produkt z bazy składników wskazany ręcznie (id USDA) — nadpisuje automatyczne dopasowanie */
  food_id?: number
}

export interface StepLine {
  text: string
  group?: string
}

/** Skąd zapisano przepis do swojej książki kucharskiej: autor oryginału */
export interface SavedFrom {
  /** Konto autora oryginału (brak, gdy je usunięto) */
  user_id?: string
  /** Nazwa użytkownika autora w chwili zapisu */
  username: string
  /** Oryginalny przepis (brak, gdy go usunięto) */
  recipe_id?: string
}

export interface Recipe {
  id: string
  title: string
  description?: string
  image_url?: string
  /** Oryginalny link, jeśli przepis został zaimportowany */
  source_url?: string
  servings?: number
  prep_minutes?: number
  cook_minutes?: number
  total_minutes?: number
  ingredients: IngredientLine[]
  steps: StepLine[]
  tags: string[]
  parse_method: ParseMethod
  created_at: string // ISO 8601
  updated_at: string // ISO 8601
  /**
   * true (albo brak wartości = starsze przepisy) = post: widoczny na profilu i w feedzie;
   * false = wpis tylko w mojej książce kucharskiej (zakładka Przepisy), prywatny
   */
  is_post?: boolean
  /** Ustawione, gdy to zapisany cudzy przepis (zawsze tylko w książce, nigdy post) */
  saved_from?: SavedFrom
  /** Autor przepisu (nadaje baza) */
  user_id?: string
  /** Dane autora — wypełnione w feedzie, wyszukiwarce i na cudzych profilach */
  author?: RecipeAuthor
}

/** Autor przepisu, tak jak widzą go inni użytkownicy */
export interface RecipeAuthor {
  username: string
  full_name?: string
  avatar_url?: string
  /** Tylko w feedzie: czy zalogowany użytkownik już obserwuje autora */
  followed?: boolean
}

/** Profil użytkownika (tabela `profiles`) */
export interface Profile {
  id: string
  username: string
  full_name?: string
  /** Zdjęcie profilowe (adres w Storage) */
  avatar_url?: string
  /** Opis profilu (bio), do 150 znaków */
  bio?: string
  /** Czy inni mogą powiększyć zdjęcie profilowe dotknięciem; brak wartości = tak */
  allow_avatar_zoom?: boolean
  is_public: boolean
}

/** Profil z licznikami i relacją do zalogowanego użytkownika */
export interface ProfileSummary extends Profile {
  recipe_count: number
  followers_count: number
  following_count: number
  is_following: boolean
  is_me: boolean
}

/** To, co produkuje parser lub formularz — id, autora i timestampy nadaje baza */
export type RecipeDraft = Omit<Recipe, 'id' | 'created_at' | 'updated_at' | 'user_id' | 'author'>

export const emptyDraft = (): RecipeDraft => ({
  title: '',
  ingredients: [],
  steps: [],
  tags: [],
  parse_method: 'manual',
})

/** Polubienia i komentarze przepisu widziane przez zalogowanego użytkownika */
export interface RecipeStats {
  like_count: number
  comment_count: number
  /** Czy zalogowany użytkownik polubił ten przepis */
  liked: boolean
  /** Najnowszy komentarz (do podglądu w feedzie) */
  last_comment?: { id: string; body: string; created_at: string; author: RecipeAuthor }
}

/** Komentarz pod przepisem z danymi autora */
export interface Comment {
  id: string
  recipe_id: string
  user_id: string
  body: string
  created_at: string
  author: RecipeAuthor
}

/** Liczniki profilu, które backend potrafi wysyłać na żywo */
export interface ProfileCounts {
  followers_count: number
  following_count: number
}

export type NotificationType = 'like' | 'comment' | 'follow'

/** Pozycja aktywności: ktoś polubił / skomentował mój przepis albo zaczął mnie obserwować */
export interface AppNotification {
  id: string
  type: NotificationType
  created_at: string
  /** Czy zostało już oznaczone jako przeczytane */
  read: boolean
  actor: RecipeAuthor
  /** Przepis, którego dotyczy polubienie lub komentarz */
  recipe?: { id: string; title: string; image_url?: string }
  comment_body?: string
}
