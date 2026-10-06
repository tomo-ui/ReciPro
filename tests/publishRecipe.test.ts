import { describe, expect, it } from 'vitest'
import type { Recipe } from '../src/types/recipe'
import { canPublishAsPost, recipeToDraft } from '../src/lib/cookbook'
import { localBackend as b } from '../src/lib/localBackend'

const base: Recipe = {
  id: 'r1',
  user_id: 'u1',
  title: 'Sernik',
  ingredients: [{ text: '1 kg sera' }],
  steps: [{ text: 'Upiecz.' }],
  tags: ['deser'],
  parse_method: 'manual',
  created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-01T10:00:00Z',
}

describe('publikacja własnego wpisu z książki jako post', () => {
  it('canPublishAsPost: tylko mój wpis z książki, który nie jest zapisany od kogoś ani już postem', () => {
    expect(canPublishAsPost({ ...base, is_post: false })).toBe(true)
    expect(canPublishAsPost({ ...base, is_post: true })).toBe(false)
    expect(canPublishAsPost(base)).toBe(false) // starszy przepis bez pola = już post
    expect(canPublishAsPost({ ...base, is_post: false, saved_from: { username: 'anna', user_id: 'u2', recipe_id: 'x' } })).toBe(false)
  })

  it('recipeToDraft: zachowuje treść, usuwa pola nadawane przez bazę i stosuje nadpisania', () => {
    const draft = recipeToDraft({ ...base, is_post: false, author: { username: 'ja' }, image_url: 'https://x/y.jpg' }, { is_post: true })
    expect(draft).toMatchObject({ title: 'Sernik', tags: ['deser'], image_url: 'https://x/y.jpg', is_post: true })
    for (const key of ['id', 'user_id', 'created_at', 'updated_at', 'author']) expect(draft).not.toHaveProperty(key)
  })

  it('tryb lokalny: wpis z książki po publikacji trafia na profil i do postów, a zapisany cudzy przepis zostaje w książce', async () => {
    const own = await b.addRecipe({ ...recipeToDraft(base), is_post: false })
    expect(own.is_post).toBe(false)
    const published = await b.updateRecipe(own.id, recipeToDraft(own, { is_post: true }))
    expect(published.is_post).toBe(true)
    expect(published.title).toBe('Sernik')

    const me = (await b.getMyProfile())!
    const posts = await b.profileRecipes(me, 0, 50)
    expect(posts.map((r) => r.id)).toContain(own.id)

    // zapisana kopia cudzego przepisu: nawet z is_post: true zostaje wpisem w książce
    const saved = await b.addRecipe({ ...recipeToDraft(base), is_post: false, saved_from: { username: 'anna', user_id: 'u2', recipe_id: 'orig' } })
    const attempt = await b.updateRecipe(saved.id, recipeToDraft(saved, { is_post: true }))
    expect(attempt.is_post).toBe(false)
    expect((await b.profileRecipes(me, 0, 50)).map((r) => r.id)).not.toContain(saved.id)
  })
})
