import type { SupabaseClient } from '@supabase/supabase-js'
import type { Diet, DietDraft } from '@/types/diet'
import { sanitizeDiet } from './diet'
import type { AppNotification, Comment, Profile, ProfileSummary, Recipe, RecipeStats } from '@/types/recipe'
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
  avatar_url: string | null
  is_public: boolean
}
interface ProfileSummaryRow extends ProfileRow {
  recipe_count: number
  followers_count: number
  following_count: number
  is_following: boolean
  is_me: boolean
}
interface CommentRow {
  id: string
  recipe_id: string
  user_id: string
  body: string
  created_at: string
  author_username: string
  author_full_name: string | null
  author_avatar_url: string | null
}

const toProfile = (r: ProfileRow): Profile => ({
  id: r.id,
  username: r.username,
  full_name: r.full_name ?? undefined,
  avatar_url: r.avatar_url ?? undefined,
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
interface StatsRow {
  recipe_id: string
  like_count: number
  comment_count: number
  liked: boolean
  last_comment_id: string | null
  last_comment_body: string | null
  last_comment_at: string | null
  last_comment_username: string | null
  last_comment_avatar_url: string | null
}
interface NotificationRow {
  id: string
  type: AppNotification['type']
  created_at: string
  is_read: boolean
  actor_id: string
  actor_username: string
  actor_full_name: string | null
  actor_avatar_url: string | null
  recipe_id: string | null
  recipe_title: string | null
  recipe_image_url: string | null
  comment_body: string | null
}
const toNotification = (r: NotificationRow): AppNotification => ({
  id: r.id,
  type: r.type,
  created_at: r.created_at,
  read: r.is_read,
  actor: { username: r.actor_username, full_name: r.actor_full_name ?? undefined, avatar_url: r.actor_avatar_url ?? undefined },
  recipe: r.recipe_id ? { id: r.recipe_id, title: r.recipe_title ?? '', image_url: r.recipe_image_url ?? undefined } : undefined,
  comment_body: r.comment_body ?? undefined,
})
interface DietRow {
  id: string
  user_id: string
  title: string
  description: string | null
  meals: Diet['meals']
  targets: Diet['targets']
  is_public: boolean
  source: Diet['source'] | null
  created_at: string
  updated_at: string
  author?: { username: string; full_name: string | null; avatar_url: string | null } | null
}
const DIET_COLUMNS = '*, author:profiles(username, full_name, avatar_url)'
const toDiet = (r: DietRow): Diet =>
  sanitizeDiet({
    id: r.id,
    user_id: r.user_id,
    title: r.title,
    description: r.description ?? undefined,
    meals: r.meals,
    targets: r.targets,
    is_public: r.is_public,
    source: r.source ?? undefined,
    created_at: r.created_at,
    updated_at: r.updated_at,
    author: r.author ? { username: r.author.username, full_name: r.author.full_name ?? undefined, avatar_url: r.author.avatar_url ?? undefined } : undefined,
  })
const dietPayload = (d: DietDraft) => ({
  title: d.title.trim(),
  description: d.description?.trim() || null,
  meals: d.meals,
  targets: d.targets,
  is_public: d.is_public,
  source: d.source ?? null,
})

const toComment = (r: CommentRow): Comment => ({
  id: r.id,
  recipe_id: r.recipe_id,
  user_id: r.user_id,
  body: r.body,
  created_at: r.created_at,
  author: {
    username: r.author_username,
    full_name: r.author_full_name ?? undefined,
    avatar_url: r.author_avatar_url ?? undefined,
  },
})

/** Zamienia błąd Postgrest na czytelny komunikat; rozpoznaje niewykonaną migrację */
function fail(error: { code?: string; message: string }, context?: 'profile'): never {
  const migrationMissing =
    error.code === 'PGRST202' || error.code === 'PGRST205' || error.code === '42P01' || error.code === '42883' ||
    /could not find the (function|table)/i.test(error.message)
  if (migrationMissing) {
    throw new Error(
      'Baza nie jest jeszcze zaktualizowana. Uruchom pliki supabase/social.sql, engagement.sql, notifications.sql i diets.sql w SQL Editorze Supabase.',
    )
  }
  if (context === 'profile' && error.code === '23505') throw new Error('Ta nazwa użytkownika jest już zajęta.')
  if (context === 'profile' && error.code === '23514') throw new Error('Nazwa użytkownika lub adres zdjęcia jest niepoprawny.')
  if (error.code === '42501') throw new Error('Brak uprawnień do tej operacji.')
  throw new Error(error.message)
}

let channelSeq = 0

/** Backend na Supabase. Klient jest wstrzykiwany, dzięki czemu można go podmienić w testach. */
export function createSupabaseBackend(getClient: () => SupabaseClient | null): Backend {
  const client = (): SupabaseClient => {
    const c = getClient()
    if (!c) throw new Error('Supabase nie jest skonfigurowany.')
    return c
  }

  async function currentUserId(): Promise<string> {
    const { data } = await client().auth.getSession() // z pamięci przeglądarki, bez zapytania do sieci
    const id = data.session?.user.id
    if (!id) throw new Error('Sesja wygasła. Zaloguj się ponownie.')
    return id
  }

  return {
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
      if (patch.avatar_url !== undefined) changes.avatar_url = patch.avatar_url
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
      const author = { username: profile.username, full_name: profile.full_name, avatar_url: profile.avatar_url }
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

    async listFollowers(username, offset, limit) {
      const { data, error } = await client().rpc('list_followers', { p_username: normalizeUsername(username), p_limit: limit, p_offset: offset })
      if (error) fail(error)
      return (data as ProfileSummaryRow[]).map(toSummary)
    },

    async listFollowing(username, offset, limit) {
      const { data, error } = await client().rpc('list_following', { p_username: normalizeUsername(username), p_limit: limit, p_offset: offset })
      if (error) fail(error)
      return (data as ProfileSummaryRow[]).map(toSummary)
    },

    subscribeProfileCounts(userId, onCounts) {
      const c = client()
      // Liczniki leżą w wierszu profilu (aktualizują je triggery), więc wystarczy nasłuchiwać jego zmian
      const channel = c
        .channel(`profile-counts-${userId}-${++channelSeq}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
          (payload) => {
            const row = payload.new as { followers_count?: unknown; following_count?: unknown }
            if (typeof row.followers_count === 'number' && typeof row.following_count === 'number') {
              onCounts({ followers_count: row.followers_count, following_count: row.following_count })
            }
          },
        )
        .subscribe()
      return () => {
        void c.removeChannel(channel)
      }
    },

    /* — aktywność (powiadomienia) — */

    async listNotifications(offset, limit) {
      const { data, error } = await client().rpc('list_notifications', { p_limit: limit, p_offset: offset })
      if (error) fail(error)
      return (data as NotificationRow[]).map(toNotification)
    },

    async countUnreadNotifications() {
      const { data, error } = await client().rpc('unread_notification_count')
      if (error) fail(error)
      return Number(data) || 0
    },

    async markNotificationsRead() {
      const { error } = await client().rpc('mark_notifications_read')
      if (error) fail(error)
    },

    subscribeNotifications(userId, onNew) {
      const c = client()
      // Powiadomienia tworzą triggery; RLS wysyła zdarzenie tylko odbiorcy, a filtr zawęża je do jego wierszy
      const channel = c
        .channel(`notifications-${userId}-${++channelSeq}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` },
          () => onNew(),
        )
        .subscribe()
      return () => {
        void c.removeChannel(channel)
      }
    },

    async getRecipe(id) {
      const { data, error } = await client().from('recipes').select('*').eq('id', id).maybeSingle()
      if (error) fail(error)
      return data ? rowToRecipe(data as RecipeRow) : null
    },

    /* — diety — */

    async listDiets(username) {
      // !inner: tylko diety osoby o tej nazwie; RLS zostawia własne oraz udostępnione
      const { data, error } = await client()
        .from('diets')
        .select('*, author:profiles!inner(username, full_name, avatar_url)')
        .eq('author.username', normalizeUsername(username))
        .order('updated_at', { ascending: false })
        .limit(50)
      if (error) fail(error)
      return (data as DietRow[]).map(toDiet)
    },

    async getDiet(id) {
      const { data, error } = await client().from('diets').select(DIET_COLUMNS).eq('id', id).maybeSingle()
      if (error) fail(error)
      return data ? toDiet(data as DietRow) : null
    },

    async saveDiet(diet) {
      if (!diet.title.trim()) throw new Error('Podaj nazwę diety.')
      const payload = dietPayload(diet)
      const query = diet.id
        ? client().from('diets').update(payload).eq('id', diet.id)
        : client().from('diets').insert(payload)
      const { data, error } = await query.select(DIET_COLUMNS).single()
      if (error) fail(error)
      return toDiet(data as DietRow)
    },

    async deleteDiet(id) {
      const { error } = await client().from('diets').delete().eq('id', id)
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

    /* — polubienia i komentarze — */

    async getRecipeStats(ids) {
      const out: Record<string, RecipeStats> = {}
      if (ids.length === 0) return out
      const { data, error } = await client().rpc('recipe_stats', { p_ids: ids.slice(0, 100) })
      if (error) fail(error)
      for (const r of data as StatsRow[]) {
        out[r.recipe_id] = {
          like_count: r.like_count,
          comment_count: r.comment_count,
          liked: r.liked,
          last_comment: r.last_comment_id
            ? {
                id: r.last_comment_id,
                body: r.last_comment_body ?? '',
                created_at: r.last_comment_at ?? '',
                author: { username: r.last_comment_username ?? '', avatar_url: r.last_comment_avatar_url ?? undefined },
              }
            : undefined,
        }
      }
      return out
    },

    async likeRecipe(recipeId) {
      const { error } = await client().from('recipe_likes').insert({ recipe_id: recipeId })
      if (error && error.code !== '23505') fail(error) // 23505 = już polubione
    },

    async unlikeRecipe(recipeId) {
      const me = await currentUserId()
      const { error } = await client().from('recipe_likes').delete().eq('recipe_id', recipeId).eq('user_id', me)
      if (error) fail(error)
    },

    async listComments(recipeId, offset, limit) {
      const { data, error } = await client().rpc('list_comments', { p_recipe: recipeId, p_limit: limit, p_offset: offset })
      if (error) fail(error)
      return (data as CommentRow[]).map(toComment)
    },

    async addComment(recipeId, body, author) {
      const text = body.trim()
      if (!text) throw new Error('Napisz komentarz.')
      if (text.length > 500) throw new Error('Komentarz może mieć najwyżej 500 znaków.')
      const { data, error } = await client()
        .from('recipe_comments')
        .insert({ recipe_id: recipeId, body: text })
        .select('id, recipe_id, user_id, body, created_at')
        .single()
      if (error) fail(error)
      const r = data as Omit<Comment, 'author'>
      return { ...r, author }
    },

    async deleteComment(comment) {
      const { error } = await client().from('recipe_comments').delete().eq('id', comment.id)
      if (error) fail(error)
    },
  }
}

export const supabaseBackend: Backend = createSupabaseBackend(() => supabase)
