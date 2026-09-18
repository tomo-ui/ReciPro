import type { Profile, ProfileSummary, Recipe, RecipeDraft } from '@/types/recipe'
import type { Backend, FeedMode, ProfilePatch, RecipeSort } from './backend'
import { seedRecipes } from './seed'
import { fold } from './text'
import { normalizeFullName, normalizeUsername, validateUsername } from './username'

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

/* — implementacja — */

const demo = buildDemo()
const demoById = new Map(demo.map((d) => [d.profile.id, d]))
const publicDemoRecipes = () => demo.filter((d) => d.profile.is_public).flatMap((d) => d.recipes.map((r) => withAuthor(r, d.profile)))

const withAuthor = (r: Recipe, p: Profile): Recipe => ({ ...r, author: { username: p.username, full_name: p.full_name } })

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

const allProfiles = (): Profile[] => [loadMe(), ...demo.map((d) => d.profile)]

function summary(p: Profile): ProfileSummary {
  const me = loadMe()
  const follows = loadFollows()
  const d = demoById.get(p.id)
  const isMe = p.id === me.id
  const recipeCount = isMe ? loadOwn().length : p.is_public ? (d?.recipes.length ?? 0) : 0
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

export const localBackend: Backend = {
  remote: false,

  async listMyRecipes() {
    return loadOwn().sort(newestFirst)
  },

  async addRecipe(draft: RecipeDraft) {
    const now = new Date().toISOString()
    const recipe: Recipe = { ...draft, id: crypto.randomUUID(), user_id: LOCAL_USER_ID, created_at: now, updated_at: now }
    saveOwn([recipe, ...loadOwn()])
    return recipe
  },

  async updateRecipe(id, draft) {
    const list = loadOwn()
    const old = list.find((r) => r.id === id)
    if (!old) throw new Error('Nie znaleziono przepisu.')
    const updated: Recipe = { ...old, ...draft, id, user_id: LOCAL_USER_ID, updated_at: new Date().toISOString() }
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
    if (patch.is_public !== undefined) next.is_public = patch.is_public
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
    if (profile.id === me.id) return page(loadOwn().sort(newestFirst).map((r) => withAuthor(r, me)), offset, limit)
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
    const candidates = [...loadOwn().map((r) => withAuthor(r, me)), ...publicDemoRecipes()]
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

  async feed(mode: FeedMode, seed: string, offset, limit) {
    const followed = loadFollows()
    const list = publicDemoRecipes().filter((r) => followed.has(r.user_id ?? ''))
    list.sort(mode === 'newest' ? newestFirst : (a, b) => hash(a.id + seed) - hash(b.id + seed))
    return page(list, offset, limit)
  },

  async popularTags(limit) {
    const counts = new Map<string, number>()
    for (const r of [...loadOwn(), ...publicDemoRecipes()]) for (const t of r.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, limit)
      .map(([tag, uses]) => ({ tag, uses }))
  },
}
