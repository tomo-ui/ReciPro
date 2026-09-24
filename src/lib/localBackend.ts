import type { Diet, MealTemplate } from '@/types/diet'
import { newMeals, itemFromRecipe, sanitizeDiet, sanitizeMealTemplate, withPortions } from './diet'
import type { AppNotification, Comment, Profile, ProfileSummary, Recipe, RecipeDraft, RecipeStats } from '@/types/recipe'
import type { Backend, FeedMode, ProfilePatch, RecipeSort } from './backend'
import { emit, on } from './events'
import { normalizeInterests } from './interests'
import { seedRecipes } from './seed'
import { fold } from './text'
import { normalizeBio, normalizeFullName, normalizeUsername, validateUsername } from './username'

/**
 * Tryb lokalny: dane w przeglądarce (localStorage), bez kont i sieci, plus kilku przykładowych
 * użytkowników, żeby feed, wyszukiwarka i profile dało się wypróbować bez Supabase.
 * Logika wyszukiwania odzwierciedla funkcje SQL z supabase/social.sql.
 */

export const LOCAL_USER_ID = 'local-me'

const KEYS = {
  recipes: 'przepisy:v2:recipes',
  legacyRecipes: 'przepisy:v1',
  profile: 'przepisy:v2:profile',
  follows: 'przepisy:v2:follows',
  likes: 'przepisy:v2:likes',
  comments: 'przepisy:v2:comments',
  notifications: 'przepisy:v2:notifications',
  diets: 'przepisy:v2:diets',
  mealTemplates: 'przepisy:v2:mealTemplates',
  interests: 'przepisy:v2:interests',
  hideTestAccounts: 'przepisy:v2:hide-test-accounts',
}

/* — magazyn: localStorage, a gdy go brak (testy, tryb prywatny) — pamięć — */

const memory = new Map<string, string>()
function read<T>(key: string, fallback: () => T): T {
  try {
    const raw = typeof localStorage === 'undefined' ? memory.get(key) : localStorage.getItem(key)
    if (raw) return JSON.parse(raw) as T
  } catch {
    /* uszkodzone dane — startujemy od domyślnych */
  }
  return fallback()
}
function write(key: string, value: unknown) {
  const raw = JSON.stringify(value)
  memory.set(key, raw)
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, raw)
  } catch {
    /* pełny storage / tryb prywatny — zmiany żyją w pamięci */
  }
}

/* — pomocnicze — */

const words = (q: string) => fold(q.replace(/[#@]/g, ' ')).split(/\s+/).filter(Boolean)

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const searchText = (r: Recipe) =>
  fold([r.title, r.description ?? '', r.tags.join(' '), ...r.ingredients.map((i) => i.text)].join(' '))

/* — przykładowi użytkownicy — */

interface DemoUser {
  profile: Profile
  followers: number
  recipes: Recipe[]
}

function buildDemo(): DemoUser[] {
  const day = 86_400_000
  const make = (
    user: string, n: number, title: string, tags: string[], ingredients: string[], steps: string[],
    servings: number, minutes: number, daysAgo: number,
  ): Recipe => {
    const at = new Date(Date.now() - daysAgo * day).toISOString()
    return {
      id: `demo-${user}-${n}`,
      user_id: `demo-${user}`,
      title,
      servings,
      total_minutes: minutes,
      ingredients: ingredients.map((text) => ({ text })),
      steps: steps.map((text) => ({ text })),
      tags,
      parse_method: 'manual',
      created_at: at,
      updated_at: at,
    }
  }
  const user = (id: string, username: string, full: string, isPublic: boolean, followers: number, recipes: Recipe[]): DemoUser => ({
    profile: { id: `demo-${id}`, username, full_name: full, is_public: isPublic },
    followers,
    recipes,
  })
  return [
    user('anna', 'anna_gotuje', 'Anna Kowalska', true, 128, [
      make('anna', 1, 'Żurek staropolski', ['zupa', 'obiad', 'tradycyjne'], ['1 l żuru', '300 g białej kiełbasy', '2 jajka', '1 łyżka majeranku', '3 ząbki czosnku'], ['Ugotuj wywar.', 'Dodaj żur i kiełbasę.', 'Dopraw majerankiem.'], 4, 60, 1),
      make('anna', 2, 'Placki ziemniaczane', ['obiad', 'szybkie'], ['1 kg ziemniaków', '1 duża cebula', '2 jajka', '3 łyżki mąki', 'sól'], ['Zetrzyj ziemniaki i cebulę.', 'Dodaj jajka i mąkę.', 'Smaż na złoto.'], 4, 30, 3),
      make('anna', 3, 'Szarlotka z kruszonką', ['deser', 'ciasto', 'jabłka'], ['1 kg jabłek', '300 g mąki', '150 g masła', '100 g cukru', '1 łyżeczka cynamonu'], ['Zagnieć ciasto.', 'Obsmaż jabłka.', 'Piecz 45 minut.'], 8, 90, 6),
    ]),
    user('zosia', 'kuchnia.zosi', 'Zofia Żurek', true, 342, [
      make('zosia', 1, 'Bigos myśliwski', ['obiad', 'kapusta', 'tradycyjne'], ['1 kg kapusty kiszonej', '500 g mięsa', '200 g kiełbasy', '2 liście laurowe', '1 cebula'], ['Podsmaż mięso.', 'Dodaj kapustę.', 'Duś 2 godziny.'], 6, 180, 2),
      make('zosia', 2, 'Pierogi ruskie', ['obiad', 'pierogi'], ['500 g mąki', '500 g ziemniaków', '250 g twarogu', '1 cebula', '1 jajko'], ['Zagnieć ciasto.', 'Zrób farsz.', 'Lep i gotuj pierogi.'], 6, 120, 5),
      make('zosia', 3, 'Sernik na zimno z malinami', ['deser', 'bez pieczenia', 'maliny'], ['500 g twarogu', '250 ml śmietanki 30%', '100 g cukru pudru', '300 g malin', '200 g herbatników'], ['Zmiksuj spód.', 'Utrzyj masę.', 'Schładzaj 4 godziny.'], 8, 270, 8),
    ]),
    user('marek', 'marek_grilluje', 'Marek Nowak', true, 57, [
      make('marek', 1, 'Karkówka z grilla', ['grill', 'mięso', 'obiad'], ['1 kg karkówki', '4 łyżki oleju', '3 ząbki czosnku', '1 łyżeczka papryki wędzonej'], ['Zamarynuj mięso.', 'Grilluj 8 minut z każdej strony.'], 4, 40, 4),
      make('marek', 2, 'Sałatka grecka', ['sałatka', 'szybkie', 'wegetariańskie'], ['2 pomidory', '1 ogórek', '200 g fety', '1 czerwona cebula', '10 oliwek'], ['Pokrój warzywa.', 'Dodaj fetę i oliwki.'], 2, 15, 7),
    ]),
    user('sekret', 'sekret', 'Prywatny Kucharz', false, 3, [
      make('sekret', 1, 'Tajny przepis babci', ['obiad', 'sekret'], ['ziemniaki', 'śmietana'], ['Ugotuj.'], 4, 60, 9),
    ]),
  ]
}

/* — powiadomienia (przykładowe, bo lokalnie nikt poza Tobą nic nie robi) — */

interface StoredNotification {
  id: string
  type: AppNotification['type']
  /** nazwa użytkownika przykładowej osoby */
  actor: string
  recipe_id?: string
  comment_body?: string
  created_at: string
  read: boolean
}

function seedNotifications(): StoredNotification[] {
  const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString()
  const own = read<Recipe[] | null>(KEYS.recipes, () => null)?.[0]?.id
  const first = own ?? 'demo-anna-1'
  return [
    { id: 'demo-n1', type: 'like', actor: 'anna_gotuje', recipe_id: first, created_at: ago(4), read: false },
    { id: 'demo-n2', type: 'comment', actor: 'marek_grilluje', recipe_id: first, comment_body: 'Robiłem wczoraj, wyszło świetnie!', created_at: ago(35), read: false },
    { id: 'demo-n3', type: 'follow', actor: 'kuchnia.zosi', created_at: ago(60 * 26), read: true },
  ]
}
const loadNotifications = () => read<StoredNotification[]>(KEYS.notifications, seedNotifications)
const saveNotifications = (list: StoredNotification[]) => write(KEYS.notifications, list)

/** Tylko tryb demo i testy: dodaje nowe powiadomienie tak, jakby przyszło na żywo */
export function pushDemoNotification(type: AppNotification['type'] = 'like', actor = 'anna_gotuje'): void {
  const recipe = loadOwn()[0]
  const item: StoredNotification = {
    id: crypto.randomUUID(),
    type,
    actor,
    recipe_id: type === 'follow' ? undefined : recipe?.id,
    comment_body: type === 'comment' ? 'Wygląda pysznie!' : undefined,
    created_at: new Date().toISOString(),
    read: false,
  }
  saveNotifications([item, ...loadNotifications()])
  emit('notifications-changed')
}

/** Powiadomienia w postaci widzianej przez aplikację (bez tych, których przepis już nie istnieje) */
function visibleNotifications(): AppNotification[] {
  const own = loadOwn()
  return loadNotifications()
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .flatMap((n): AppNotification[] => {
      const actor = allProfiles().find((p) => p.username === n.actor)
      if (!actor) return []
      const recipe = n.recipe_id ? own.find((r) => r.id === n.recipe_id) : undefined
      if (n.type !== 'follow' && !recipe) return [] // przepis usunięty razem z powiadomieniem
      return [
        {
          id: n.id,
          type: n.type,
          created_at: n.created_at,
          read: n.read,
          actor: { username: actor.username, full_name: actor.full_name, avatar_url: actor.avatar_url },
          recipe: recipe && { id: recipe.id, title: recipe.title, image_url: recipe.image_url },
          comment_body: n.comment_body,
        },
      ]
    })
}

/* — diety: własne w localStorage, przykładowe u użytkowników demo — */

const loadMyDiets = () => read<Diet[]>(KEYS.diets, () => []).map(sanitizeDiet)
const saveMyDiets = (list: Diet[]) => write(KEYS.diets, list)

const loadMealTemplates = () => read<MealTemplate[]>(KEYS.mealTemplates, () => []).map(sanitizeMealTemplate)
const saveMealTemplatesList = (list: MealTemplate[]) => write(KEYS.mealTemplates, list)

let demoDietCache: Diet[] | undefined
/** Jedna przykładowa, udostępniona dieta Anny, żeby dało się wypróbować oglądanie i zapisywanie cudzej diety */
function demoDiets(): Diet[] {
  if (demoDietCache) return demoDietCache
  const anna = demo.find((d) => d.profile.username === 'anna_gotuje')
  if (!anna) return (demoDietCache = [])
  const meals = newMeals(4)
  const [r1, r2, r3] = anna.recipes
  const put = (i: number, recipe: Recipe | undefined, portions = 1) => recipe && meals[i].items.push(withPortions(itemFromRecipe(recipe), portions))
  put(0, r2)
  put(1, r1, 1.25)
  put(2, r3, 0.5)
  put(3, r2, 0.75)
  const at = new Date(Date.now() - 2 * 86_400_000).toISOString()
  demoDietCache = [
    {
      id: 'demo-diet-anna-1',
      user_id: anna.profile.id,
      title: 'Dieta 1800 kcal na cztery posiłki',
      description: 'Prosta rozpiska z moich przepisów. Możesz ją zapisać u siebie i dopasować pod siebie.',
      meals,
      targets: { kcalPerDay: 1800, protein: 25, fat: 30, carbs: 45, preset: 'custom', lowSalt: false, highFiber: true },
      is_public: true,
      created_at: at,
      updated_at: at,
      author: { username: anna.profile.username, full_name: anna.profile.full_name },
    },
  ]
  return demoDietCache
}

/* — implementacja — */

const demo = buildDemo()
const demoById = new Map(demo.map((d) => [d.profile.id, d]))
/** Tryb demo: dla admina („tk”) przykładowi użytkownicy udają konta testowe i można je wyłączyć w panelu admina */
const isAdmin = () => loadMe().username === 'tk'
const visibleDemo = () => (isAdmin() && read<boolean>(KEYS.hideTestAccounts, () => false) ? [] : demo)
const publicDemoRecipes = () => visibleDemo().filter((d) => d.profile.is_public).flatMap((d) => d.recipes.map((r) => withAuthor(r, d.profile)))

const withAuthor = (r: Recipe, p: Profile): Recipe => ({
  ...r,
  author: { username: p.username, full_name: p.full_name, avatar_url: p.avatar_url },
})

const defaultProfile = (): Profile => ({ id: LOCAL_USER_ID, username: 'ty', full_name: 'Ty', is_public: true })
const loadMe = () => read<Profile>(KEYS.profile, defaultProfile)
const loadFollows = () => new Set(read<string[]>(KEYS.follows, () => []))
const saveFollows = (s: Set<string>) => write(KEYS.follows, [...s])

function loadOwn(): Recipe[] {
  const stored = read<Recipe[] | null>(KEYS.recipes, () => null)
  if (stored) return stored
  const legacy = read<Recipe[] | null>(KEYS.legacyRecipes, () => null) // dane z wersji sprzed kont
  const initial = (legacy ?? seedRecipes()).map((r) => ({ ...r, user_id: LOCAL_USER_ID }))
  write(KEYS.recipes, initial)
  return initial
}
const saveOwn = (list: Recipe[]) => write(KEYS.recipes, list)
const newestFirst = (a: Recipe, b: Recipe) => b.created_at.localeCompare(a.created_at)
/** Post (profil, feed, wyszukiwarka) kontra wpis tylko w książce kucharskiej; starsze przepisy bez pola są postami */
const isPost = (r: Recipe) => r.is_post !== false

const allProfiles = (): Profile[] => [loadMe(), ...visibleDemo().map((d) => d.profile)]

function summary(p: Profile): ProfileSummary {
  const me = loadMe()
  const follows = loadFollows()
  const d = demoById.get(p.id)
  const isMe = p.id === me.id
  const recipeCount = isMe ? loadOwn().filter(isPost).length : p.is_public ? (d?.recipes.length ?? 0) : 0
  return {
    ...p,
    recipe_count: recipeCount,
    followers_count: (d?.followers ?? 0) + (follows.has(p.id) ? 1 : 0),
    following_count: isMe ? follows.size : 5,
    is_following: follows.has(p.id),
    is_me: isMe,
  }
}

const page = <T,>(list: T[], offset: number, limit: number) => list.slice(offset, offset + limit)

const loadInterests = () => normalizeInterests(read<string[]>(KEYS.interests, () => []))
const loadLikes = () => new Set(read<string[]>(KEYS.likes, () => []))

/** Kilka komentarzy pod przykładowymi przepisami, żeby sekcja komentarzy nie była pusta */
function seedComments(): Comment[] {
  const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString()
  const by = (username: string) => {
    const d = demo.find((x) => x.profile.username === username)!.profile
    return { user_id: d.id, author: { username: d.username, full_name: d.full_name } }
  }
  const c = (n: number, recipe: string, who: string, body: string, hoursAgo: number): Comment => ({
    id: `demo-comment-${n}`,
    recipe_id: recipe,
    body,
    created_at: at(hoursAgo),
    ...by(who),
  })
  return [
    c(1, 'demo-zosia-1', 'anna_gotuje', 'Robiłam w niedzielę — cała rodzina zachwycona!', 30),
    c(2, 'demo-zosia-1', 'marek_grilluje', 'Dodałem trochę suszonych grzybów, polecam.', 6),
    c(3, 'demo-anna-1', 'kuchnia.zosi', 'Idealny na zimowy dzień.', 52),
  ]
}
function loadComments(): Comment[] {
  const stored = read<Comment[] | null>(KEYS.comments, () => null)
  if (stored) return stored
  const seeded = seedComments() // zapisujemy od razu, żeby czasy i usunięcia przykładowych komentarzy były stałe
  write(KEYS.comments, seeded)
  return seeded
}
const newestComment = (comments: Comment[], recipeId: string): RecipeStats['last_comment'] => {
  const c = comments.filter((x) => x.recipe_id === recipeId).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  return c && { id: c.id, body: c.body, created_at: c.created_at, author: c.author }
}
const saveComments = (list: Comment[]) => write(KEYS.comments, list)

/** Liczby polubień pod przykładowymi przepisami są stałe (z hasha id), własne polubienie dolicza się do nich */
const baseLikes = (recipeId: string) => (recipeId.startsWith('demo-') ? hash(recipeId) % 23 : 0)

/** Obserwujący i obserwowani w trybie demo: przykładowe osoby (prawdziwych relacji tu nie ma) */
function demoPeople(target: Profile, kind: 'followers' | 'following'): Profile[] {
  const me = loadMe()
  if (!target.is_public && target.id !== me.id) return []
  const follows = loadFollows()
  const others = visibleDemo().map((d) => d.profile).filter((p) => p.id !== target.id && p.is_public)
  if (kind === 'following') {
    return target.id === me.id ? visibleDemo().map((d) => d.profile).filter((p) => follows.has(p.id)) : others.slice(0, 2)
  }
  if (target.id === me.id) return []
  return [...(follows.has(target.id) ? [me] : []), ...others]
}

export const localBackend: Backend = {
  remote: false,

  async listMyRecipes() {
    return loadOwn().sort(newestFirst)
  },

  async addRecipe(draft: RecipeDraft) {
    const now = new Date().toISOString()
    const own = loadOwn()
    if (draft.saved_from?.recipe_id && own.some((r) => r.saved_from?.recipe_id === draft.saved_from?.recipe_id)) throw new Error('Ten przepis jest już w Twojej książce.')
    // zapisany cudzy przepis jest zawsze tylko w książce (jak ograniczenie w bazie)
    const recipe: Recipe = { ...draft, is_post: draft.saved_from ? false : draft.is_post, id: crypto.randomUUID(), user_id: LOCAL_USER_ID, created_at: now, updated_at: now }
    saveOwn([recipe, ...own])
    return recipe
  },

  async updateRecipe(id, draft) {
    const list = loadOwn()
    const old = list.find((r) => r.id === id)
    if (!old) throw new Error('Nie znaleziono przepisu.')
    const updated: Recipe = { ...old, ...draft, is_post: old.saved_from ? false : draft.is_post, saved_from: old.saved_from, id, user_id: LOCAL_USER_ID, updated_at: new Date().toISOString() }
    saveOwn(list.map((r) => (r.id === id ? updated : r)))
    return updated
  },

  async removeRecipe(recipe) {
    saveOwn(loadOwn().filter((r) => r.id !== recipe.id))
  },

  async getMyProfile() {
    return loadMe()
  },

  async createProfile(username, fullName) {
    const invalid = validateUsername(username)
    if (invalid) throw new Error(invalid)
    if (!(await this.usernameAvailable(username))) throw new Error('Ta nazwa użytkownika jest już zajęta.')
    const profile: Profile = { ...loadMe(), username: normalizeUsername(username), full_name: normalizeFullName(fullName ?? '') }
    write(KEYS.profile, profile)
    return profile
  },

  async updateProfile(patch: ProfilePatch) {
    const me = loadMe()
    const next = { ...me }
    if (patch.username !== undefined && normalizeUsername(patch.username) !== me.username) {
      const invalid = validateUsername(patch.username)
      if (invalid) throw new Error(invalid)
      if (!(await this.usernameAvailable(patch.username))) throw new Error('Ta nazwa użytkownika jest już zajęta.')
      next.username = normalizeUsername(patch.username)
    }
    if (patch.full_name !== undefined) next.full_name = normalizeFullName(patch.full_name ?? '')
    if (patch.bio !== undefined) next.bio = normalizeBio(patch.bio ?? '')
    if (patch.allow_avatar_zoom !== undefined) next.allow_avatar_zoom = patch.allow_avatar_zoom
    if (patch.is_public !== undefined) next.is_public = patch.is_public
    if (patch.avatar_url !== undefined) next.avatar_url = patch.avatar_url ?? undefined
    write(KEYS.profile, next)
    return next
  },

  async usernameAvailable(username) {
    if (validateUsername(username)) return false
    const u = normalizeUsername(username)
    return !allProfiles().some((p) => p.username === u)
  },

  async getProfile(username) {
    const u = normalizeUsername(username)
    const p = allProfiles().find((x) => x.username === u)
    return p ? summary(p) : null
  },

  async profileRecipes(profile, offset, limit) {
    const me = loadMe()
    if (profile.id === me.id) return page(loadOwn().filter(isPost).sort(newestFirst).map((r) => withAuthor(r, me)), offset, limit)
    const d = demoById.get(profile.id)
    if (!d || !d.profile.is_public) return []
    return page([...d.recipes].sort(newestFirst).map((r) => withAuthor(r, d.profile)), offset, limit)
  },

  async searchProfiles(query, offset, limit) {
    const w = words(query)
    const raw = fold(query.replace(/@/g, '').trim())
    const matches = allProfiles().filter((p) => {
      const hay = fold(`${p.username} ${p.full_name ?? ''}`)
      return w.every((x) => hay.includes(x))
    })
    const rank = (p: Profile) => (p.username === raw ? 0 : p.username.startsWith(raw) ? 1 : 2)
    matches.sort((a, b) => rank(a) - rank(b) || summary(b).followers_count - summary(a).followers_count || a.username.localeCompare(b.username))
    return page(matches, offset, limit).map(summary)
  },

  async follow(userId) {
    if (userId === loadMe().id) return
    const f = loadFollows()
    f.add(userId)
    saveFollows(f)
  },

  async unfollow(userId) {
    const f = loadFollows()
    f.delete(userId)
    saveFollows(f)
  },

  async searchRecipes(query: string, sort: RecipeSort, offset, limit) {
    const me = loadMe()
    const w = words(query)
    const candidates = [...loadOwn().filter(isPost).map((r) => withAuthor(r, me)), ...publicDemoRecipes()]
    const scored = candidates
      .filter((r) => {
        const hay = searchText(r)
        return w.every((x) => hay.includes(x))
      })
      .map((r) => {
        const title = fold(r.title)
        const tags = fold(r.tags.join(' '))
        const score = w.filter((x) => title.includes(x)).length * 3 + w.filter((x) => tags.includes(x)).length * 2
        return { r, score }
      })
    scored.sort((a, b) => (sort === 'newest' ? 0 : b.score - a.score) || newestFirst(a.r, b.r))
    return page(scored.map((s) => s.r), offset, limit)
  },

  /** Odpowiednik supabase/engagement.sql (public.feed): obserwowani i pasujący do zainteresowań/polubień, potem reszta */
  async feed(mode: FeedMode, seed: string, offset, limit) {
    const followed = loadFollows()
    const flagged = publicDemoRecipes().map((r) => ({ ...r, author: { ...r.author!, followed: followed.has(r.user_id ?? '') } }))
    if (mode === 'newest') return page(flagged.filter((r) => r.author.followed).sort(newestFirst), offset, limit)

    const interests = loadInterests().map(fold)
    const liked = loadLikes()
    const likedTags = new Map<string, number>()
    for (const r of [...loadOwn(), ...publicDemoRecipes()]) {
      if (liked.has(r.id)) for (const t of r.tags) likedTags.set(fold(t), Math.min(3, (likedTags.get(fold(t)) ?? 0) + 1))
    }
    const now = Date.now()
    const scored = flagged.map((r) => {
      const tags = r.tags.map(fold)
      const title = fold(r.title)
      const match =
        tags.filter((t) => interests.includes(t)).length * 3 +
        interests.filter((i) => i && title.includes(i)).length * 2 +
        tags.reduce((sum, t) => sum + (likedTags.get(t) ?? 0), 0)
      const recommended = r.author.followed || match > 0
      const ageDays = Math.max(0, now - new Date(r.created_at).getTime()) / 86_400_000
      const rank = (r.author.followed ? 2 : 0) + match + (hash(r.id + seed) % 1000) / 1000 * 1.5 + 2 * Math.exp(-ageDays / 14)
      return { r, recommended, rank }
    })
    scored.sort((a, b) => Number(b.recommended) - Number(a.recommended) || (a.recommended ? b.rank - a.rank : newestFirst(a.r, b.r)))
    return page(scored.map((s) => s.r), offset, limit)
  },

  async getAdminSettings() {
    if (!isAdmin()) return null
    return { show_test_accounts: !read<boolean>(KEYS.hideTestAccounts, () => false), test_accounts: demo.length }
  },

  async setShowTestAccounts(show) {
    if (isAdmin()) write(KEYS.hideTestAccounts, !show)
  },

  async getInterests() {
    return loadInterests()
  },

  async setInterests(list) {
    const next = normalizeInterests(list)
    write(KEYS.interests, next)
    return next
  },

  async popularTags(limit) {
    const counts = new Map<string, number>()
    for (const r of [...loadOwn(), ...publicDemoRecipes()]) for (const t of r.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, limit)
      .map(([tag, uses]) => ({ tag, uses }))
  },

  async listFollowers(username, offset, limit) {
    const target = allProfiles().find((p) => p.username === normalizeUsername(username))
    return target ? page(demoPeople(target, 'followers').map(summary), offset, limit) : []
  },

  async listFollowing(username, offset, limit) {
    const target = allProfiles().find((p) => p.username === normalizeUsername(username))
    return target ? page(demoPeople(target, 'following').map(summary), offset, limit) : []
  },

  subscribeProfileCounts(userId, onCounts) {
    // Lokalnie zmiany pochodzą tylko od użytkownika, więc wystarczy zdarzenie z aplikacji
    return on('follows-changed', () => {
      const p = allProfiles().find((x) => x.id === userId)
      if (!p) return
      const { followers_count, following_count } = summary(p)
      onCounts({ followers_count, following_count })
    })
  },

  async listNotifications(offset, limit) {
    return page(visibleNotifications(), offset, limit)
  },

  async countUnreadNotifications() {
    return visibleNotifications().filter((n) => !n.read).length
  },

  async markNotificationsRead() {
    saveNotifications(loadNotifications().map((n) => ({ ...n, read: true })))
  },

  subscribeNotifications(_userId, onNew) {
    return on('notifications-changed', onNew)
  },

  async getRecipe(id) {
    const own = loadOwn().find((r) => r.id === id)
    if (own) return withAuthor(own, loadMe())
    return publicDemoRecipes().find((r) => r.id === id) ?? null
  },

  async listDiets(username) {
    const name = normalizeUsername(username)
    if (name === loadMe().username) return loadMyDiets().sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    const owner = demo.find((d) => d.profile.username === name)
    if (!owner?.profile.is_public) return []
    return demoDiets().filter((d) => d.user_id === owner.profile.id && d.is_public)
  },

  async getDiet(id) {
    return loadMyDiets().find((d) => d.id === id) ?? demoDiets().find((d) => d.id === id) ?? null
  },

  async saveDiet(draft) {
    if (!draft.title.trim()) throw new Error('Podaj nazwę diety.')
    const now = new Date().toISOString()
    const mine = loadMyDiets()
    const existing = draft.id ? mine.find((d) => d.id === draft.id) : undefined
    if (draft.id && !existing) throw new Error('Brak uprawnień do tej diety.')
    const saved: Diet = {
      ...draft,
      title: draft.title.trim(),
      id: existing?.id ?? crypto.randomUUID(),
      user_id: LOCAL_USER_ID,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    }
    saveMyDiets(existing ? mine.map((d) => (d.id === saved.id ? saved : d)) : [saved, ...mine])
    return saved
  },

  async deleteDiet(id) {
    saveMyDiets(loadMyDiets().filter((d) => d.id !== id))
  },

  async listMealTemplates() {
    return loadMealTemplates().sort((a, b) => b.created_at.localeCompare(a.created_at))
  },

  async saveMealTemplate(draft) {
    if (!draft.name.trim()) throw new Error('Podaj nazwę posiłku.')
    const now = new Date().toISOString()
    const list = loadMealTemplates()
    const existing = draft.id ? list.find((t) => t.id === draft.id) : undefined
    if (draft.id && !existing) throw new Error('Brak uprawnień do tego posiłku.')
    const saved: MealTemplate = {
      ...draft,
      name: draft.name.trim(),
      id: existing?.id ?? crypto.randomUUID(),
      user_id: LOCAL_USER_ID,
      created_at: existing?.created_at ?? now,
    }
    saveMealTemplatesList(existing ? list.map((t) => (t.id === saved.id ? saved : t)) : [saved, ...list])
    return saved
  },

  async deleteMealTemplate(id) {
    saveMealTemplatesList(loadMealTemplates().filter((t) => t.id !== id))
  },

  async getRecipeStats(ids) {
    const liked = loadLikes()
    const comments = loadComments()
    const out: Record<string, RecipeStats> = {}
    for (const id of ids) {
      out[id] = {
        like_count: baseLikes(id) + (liked.has(id) ? 1 : 0),
        comment_count: comments.filter((c) => c.recipe_id === id).length,
        liked: liked.has(id),
        last_comment: newestComment(comments, id),
      }
    }
    return out
  },

  async likeRecipe(recipeId) {
    const l = loadLikes()
    l.add(recipeId)
    write(KEYS.likes, [...l])
  },

  async unlikeRecipe(recipeId) {
    const l = loadLikes()
    l.delete(recipeId)
    write(KEYS.likes, [...l])
  },

  async listComments(recipeId, offset, limit) {
    const list = loadComments().filter((c) => c.recipe_id === recipeId).sort((a, b) => b.created_at.localeCompare(a.created_at))
    return page(list, offset, limit)
  },

  async addComment(recipeId, body, author) {
    const text = body.trim()
    if (!text) throw new Error('Napisz komentarz.')
    if (text.length > 500) throw new Error('Komentarz może mieć najwyżej 500 znaków.')
    const comment: Comment = {
      id: crypto.randomUUID(),
      recipe_id: recipeId,
      user_id: LOCAL_USER_ID,
      body: text,
      created_at: new Date().toISOString(),
      author,
    }
    saveComments([comment, ...loadComments()])
    return comment
  },

  async deleteComment(comment) {
    const ownsRecipe = loadOwn().some((r) => r.id === comment.recipe_id)
    if (comment.user_id !== LOCAL_USER_ID && !ownsRecipe) throw new Error('Brak uprawnień do usunięcia tego komentarza.')
    saveComments(loadComments().filter((c) => c.id !== comment.id))
  },
}
