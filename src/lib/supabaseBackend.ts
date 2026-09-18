import type { Profile, ProfileSummary, Recipe } from '@/types/recipe'
import type { Backend } from './backend'
import { deleteRecipeImage } from './images'
import { supabase } from './supabase'
import {
  draftToInsert,
  rowToRecipe,
  rowWithAuthorToRecipe,
  type RecipeRow,
  type RecipeWithAuthorRow,
} from './supabaseRepository'
import { normalizeFullName, normalizeUsername, validateUsername } from './username'

interface ProfileRow {
  id: string
  username: string
  full_name: string | null
  is_public: boolean
}
interface ProfileSummaryRow extends ProfileRow {
  recipe_count: number
  followers_count: number
  following_count: number
  is_following: boolean
  is_me: boolean
}

const toProfile = (r: ProfileRow): Profile => ({
  id: r.id,
  username: r.username,
  full_name: r.full_name ?? undefined,
  is_public: r.is_public,
})
const toSummary = (r: ProfileSummaryRow): ProfileSummary => ({
  ...toProfile(r),
  recipe_count: r.recipe_count,
  followers_count: r.followers_count,
  following_count: r.following_count,
  is_following: r.is_following,
  is_me: r.is_me,
})

function client() {
  if (!supabase) throw new Error('Supabase nie jest skonfigurowany.')
  return supabase
}

async function currentUserId(): Promise<string> {
  const { data } = await client().auth.getSession() // z pamięci przeglądarki, bez zapytania do sieci
  const id = data.session?.user.id
  if (!id) throw new Error('Sesja wygasła. Zaloguj się ponownie.')
  return id
}

/** Zamienia błąd Postgrest na czytelny komunikat; rozpoznaje niewykonaną migrację */
function fail(error: { code?: string; message: string }, context?: 'profile'): never {
  const migrationMissing =
    error.code === 'PGRST202' || error.code === 'PGRST205' || error.code === '42P01' || error.code === '42883' ||
    /could not find the (function|table)/i.test(error.message)
  if (migrationMissing) {
    throw new Error('Baza nie jest jeszcze zaktualizowana. Uruchom plik supabase/social.sql w SQL Editorze Supabase.')
  }
  if (context === 'profile' && error.code === '23505') throw new Error('Ta nazwa użytkownika jest już zajęta.')
  if (context === 'profile' && error.code === '23514') throw new Error('Nazwa użytkownika jest niepoprawna.')
  if (error.code === '42501') throw new Error('Brak uprawnień do tej operacji.')
  throw new Error(error.message)
}

export const supabaseBackend: Backend = {
  remote: true,

  /* — moje przepisy — */

  async listMyRecipes() {
    const id = await currentUserId()
    // Filtr po user_id jest konieczny: polityka SELECT pokazuje też cudze przepisy z profili publicznych
    const { data, error } = await client().from('recipes').select('*').eq('user_id', id).order('created_at', { ascending: false })
    if (error) fail(error)
    return (data as RecipeRow[]).map(rowToRecipe)
  },

  async addRecipe(draft) {
    const { data, error } = await client().from('recipes').insert(draftToInsert(draft)).select().single()
    if (error) fail(error)
    return rowToRecipe(data as RecipeRow)
  },

  async updateRecipe(id, draft) {
    const { data, error } = await client().from('recipes').update(draftToInsert(draft)).eq('id', id).select().single()
    if (error) fail(error)
    return rowToRecipe(data as RecipeRow)
  },

  async removeRecipe(recipe) {
    const { error } = await client().from('recipes').delete().eq('id', recipe.id)
    if (error) fail(error)
    // Zdjęcie kasujemy dopiero po skutecznym usunięciu przepisu; błąd zdjęcia nie cofa usunięcia
    await deleteRecipeImage(recipe.image_url)
  },

  /* — profile — */

  async getMyProfile() {
    const id = await currentUserId()
    const { data, error } = await client().from('profiles').select('*').eq('id', id).maybeSingle()
    if (error) fail(error, 'profile')
    return data ? toProfile(data as ProfileRow) : null
  },

  async createProfile(username, fullName) {
    const invalid = validateUsername(username)
    if (invalid) throw new Error(invalid)
    const id = await currentUserId()
    const { data, error } = await client()
      .from('profiles')
      .insert({ id, username: normalizeUsername(username), full_name: normalizeFullName(fullName ?? '') ?? null })
      .select()
      .single()
    if (error) fail(error, 'profile')
    return toProfile(data as ProfileRow)
  },

  async updateProfile(patch) {
    const id = await currentUserId()
    const changes: Record<string, unknown> = {}
    if (patch.username !== undefined) {
      const invalid = validateUsername(patch.username)
      if (invalid) throw new Error(invalid)
      changes.username = normalizeUsername(patch.username)
    }
    if (patch.full_name !== undefined) changes.full_name = normalizeFullName(patch.full_name ?? '') ?? null
    if (patch.is_public !== undefined) changes.is_public = patch.is_public
    const { data, error } = await client().from('profiles').update(changes).eq('id', id).select().single()
    if (error) fail(error, 'profile')
    return toProfile(data as ProfileRow)
  },

  async usernameAvailable(username) {
    if (validateUsername(username)) return false
    const { data, error } = await client().rpc('username_available', { p_username: normalizeUsername(username) })
    if (error) fail(error)
    return data === true
  },

  async getProfile(username) {
    const { data, error } = await client().rpc('get_profile', { p_username: normalizeUsername(username) })
    if (error) fail(error)
    const row = (data as ProfileSummaryRow[])[0]
    return row ? toSummary(row) : null
  },

  async profileRecipes(profile, offset, limit) {
    const { data, error } = await client()
      .from('recipes')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
    if (error) fail(error)
    const author = { username: profile.username, full_name: profile.full_name }
    return (data as RecipeRow[]).map((r): Recipe => ({ ...rowToRecipe(r), author }))
  },

  async searchProfiles(query, offset, limit) {
    const { data, error } = await client().rpc('search_profiles', { p_query: query, p_limit: limit, p_offset: offset })
    if (error) fail(error)
    return (data as ProfileSummaryRow[]).map(toSummary)
  },

  async follow(userId) {
    const me = await currentUserId()
    const { error } = await client().from('follows').insert({ follower_id: me, followee_id: userId })
    if (error && error.code !== '23505') fail(error) // 23505 = już obserwujesz
  },

  async unfollow(userId) {
    const me = await currentUserId()
    const { error } = await client().from('follows').delete().eq('follower_id', me).eq('followee_id', userId)
    if (error) fail(error)
  },

  /* — odkrywanie — */

  async searchRecipes(query, sort, offset, limit) {
    const { data, error } = await client().rpc('search_recipes', { p_query: query, p_sort: sort, p_limit: limit, p_offset: offset })
    if (error) fail(error)
    return (data as RecipeWithAuthorRow[]).map(rowWithAuthorToRecipe)
  },

  async feed(mode, seed, offset, limit) {
    const { data, error } = await client().rpc('feed', { p_mode: mode, p_seed: seed, p_limit: limit, p_offset: offset })
    if (error) fail(error)
    return (data as RecipeWithAuthorRow[]).map(rowWithAuthorToRecipe)
  },

  async popularTags(limit) {
    const { data, error } = await client().rpc('popular_tags', { p_limit: limit })
    if (error) fail(error)
    return data as { tag: string; uses: number }[]
  },
}
