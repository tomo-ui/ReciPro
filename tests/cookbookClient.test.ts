import { describe, expect, it } from 'vitest'
import { draftToInsert, rowToRecipe, type RecipeRow } from '../src/lib/supabaseRepository'
import { draftToForm, emptyForm, formToDraft } from '../src/lib/recipeForm'
import { isPostRecipe, isSavedRecipe } from '../src/lib/cookbook'
import { emptyDraft, type RecipeDraft } from '../src/types/recipe'

const row = (over: Partial<RecipeRow> = {}): RecipeRow => ({
  id: 'r',
  user_id: 'u',
  title: 'Bigos',
  description: null,
  image_url: null,
  source_url: null,
  servings: null,
  prep_minutes: null,
  cook_minutes: null,
  total_minutes: null,
  ingredients: [],
  steps: [],
  tags: [],
  parse_method: 'manual',
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  ...over,
})

describe('książka kucharska: mapowanie wiersza i szkicu', () => {
  it('wiersz sprzed migracji (bez kolumn) to zwykły post bez oznaczenia', () => {
    const r = rowToRecipe(row())
    expect(r.is_post).toBeUndefined()
    expect(r.saved_from).toBeUndefined()
    expect(isPostRecipe(r)).toBe(true)
    expect(isSavedRecipe(r)).toBe(false)
  })

  it('zapisany przepis: oznaczenie autora z kolumn saved_from_*', () => {
    const r = rowToRecipe(row({ is_post: false, saved_from_username: 'anna', saved_from_user_id: 'ua', saved_from_recipe_id: 'ra' }))
    expect(r.is_post).toBe(false)
    expect(r.saved_from).toEqual({ username: 'anna', user_id: 'ua', recipe_id: 'ra' })
    expect(isPostRecipe(r)).toBe(false)
    expect(isSavedRecipe(r)).toBe(true)
    // oryginał usunięty: zostaje sama nazwa autora
    expect(rowToRecipe(row({ is_post: false, saved_from_username: 'anna' })).saved_from).toEqual({ username: 'anna', user_id: undefined, recipe_id: undefined })
  })

  it('draftToInsert: kolumn książki nie wysyła, dopóki nie są potrzebne (działa na bazie sprzed migracji)', () => {
    const plain = draftToInsert({ ...emptyDraft(), title: 'A', is_post: true })
    expect(plain).not.toHaveProperty('is_post')
    expect(plain).not.toHaveProperty('saved_from_username')
    expect(draftToInsert({ ...emptyDraft(), title: 'A' }, true)).not.toHaveProperty('is_post') // starszy przepis bez pola
  })

  it('draftToInsert: wpis w książce, zapisany cudzy przepis i zmiana rodzaju przy edycji', () => {
    expect(draftToInsert({ ...emptyDraft(), title: 'A', is_post: false })).toMatchObject({ is_post: false })
    const saved: RecipeDraft = { ...emptyDraft(), title: 'A', is_post: false, saved_from: { username: 'anna', user_id: 'ua', recipe_id: 'ra' } }
    expect(draftToInsert(saved)).toMatchObject({ is_post: false, saved_from_username: 'anna', saved_from_user_id: 'ua', saved_from_recipe_id: 'ra' })
    // edycja wysyła is_post (także true → publikacja), ale nie dotyka oznaczenia autora
    expect(draftToInsert({ ...emptyDraft(), title: 'A', is_post: true }, true)).toMatchObject({ is_post: true })
    expect(draftToInsert(saved, true)).not.toHaveProperty('saved_from_username')
  })

  it('formularz: domyślnie post; zachowuje wybór i oznaczenie autora; zapisany przepis nigdy nie jest postem', () => {
    expect(formToDraft({ ...emptyForm(), title: 'X' }).is_post).toBe(true)
    expect(formToDraft({ ...emptyForm(), title: 'X', is_post: false }).is_post).toBe(false)
    const saved = { username: 'anna', recipe_id: 'ra' }
    const f = draftToForm({ ...emptyDraft(), title: 'X', is_post: false, saved_from: saved })
    expect(f.saved_from).toEqual(saved)
    expect(formToDraft({ ...f, is_post: true })).toMatchObject({ is_post: false, saved_from: saved })
    expect(formToDraft(draftToForm({ ...emptyDraft(), title: 'Stary' })).is_post).toBeUndefined() // starszy przepis: bez zmiany
  })
})
