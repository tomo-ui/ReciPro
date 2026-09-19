import { describe, expect, it } from 'vitest'
import { emit } from '../src/lib/events'
import { LOCAL_USER_ID, localBackend as b } from '../src/lib/localBackend'

const me = { username: 'ty', full_name: 'Ty', avatar_url: undefined }

describe('tryb lokalny: polubienia', () => {
  it('statystyki: polubienie zwiększa licznik i ustawia flagę, cofnięcie wraca', async () => {
    const id = 'demo-anna-2'
    const before = (await b.getRecipeStats([id]))[id]
    expect(before.liked).toBe(false)
    await b.likeRecipe(id)
    const liked = (await b.getRecipeStats([id]))[id]
    expect(liked).toEqual({ ...before, liked: true, like_count: before.like_count + 1 })
    await b.likeRecipe(id) // idempotentne
    expect((await b.getRecipeStats([id]))[id].like_count).toBe(before.like_count + 1)
    await b.unlikeRecipe(id)
    expect((await b.getRecipeStats([id]))[id]).toEqual(before)
  })

  it('liczba polubień przykładowych przepisów jest stała', async () => {
    const a = await b.getRecipeStats(['demo-zosia-1'])
    const c = await b.getRecipeStats(['demo-zosia-1'])
    expect(a).toEqual(c)
  })
})

describe('tryb lokalny: komentarze', () => {
  it('są przykładowe komentarze, od najnowszych, ze stronicowaniem', async () => {
    const all = await b.listComments('demo-zosia-1', 0, 10)
    expect(all.length).toBeGreaterThanOrEqual(2)
    const times = all.map((c) => c.created_at)
    expect([...times].sort().reverse()).toEqual(times)
    expect(await b.listComments('demo-zosia-1', 0, 1)).toHaveLength(1)
    expect((await b.getRecipeStats(['demo-zosia-1']))['demo-zosia-1'].comment_count).toBe(all.length)
  })

  it('dodawanie: przycina, waliduje, trafia na początek; licznik rośnie', async () => {
    const id = 'demo-marek-1'
    const n = (await b.getRecipeStats([id]))[id].comment_count
    const c = await b.addComment(id, '  Wyszło świetnie!  ', me)
    expect(c).toMatchObject({ body: 'Wyszło świetnie!', user_id: LOCAL_USER_ID, author: me })
    expect((await b.listComments(id, 0, 5))[0].id).toBe(c.id)
    expect((await b.getRecipeStats([id]))[id].comment_count).toBe(n + 1)
    await expect(b.addComment(id, '   ', me)).rejects.toThrow(/Napisz/)
    await expect(b.addComment(id, 'x'.repeat(501), me)).rejects.toThrow(/500/)
  })

  it('usuwanie: własny komentarz tak, cudzy pod cudzym przepisem nie, cudzy pod własnym przepisem tak', async () => {
    const own = await b.addComment('demo-marek-2', 'do usunięcia', me)
    await b.deleteComment(own)
    expect((await b.listComments('demo-marek-2', 0, 20)).some((c) => c.id === own.id)).toBe(false)

    const [foreign] = await b.listComments('demo-anna-1', 0, 5)
    expect(foreign.user_id).not.toBe(LOCAL_USER_ID)
    await expect(b.deleteComment(foreign)).rejects.toThrow(/uprawnień/)

    // pod własnym przepisem autor może usunąć komentarz kogokolwiek
    const mine = await b.addRecipe({ title: 'Mój', ingredients: [], steps: [], tags: [], parse_method: 'manual' })
    const stranger = { id: 'obcy', recipe_id: mine.id, user_id: 'demo-anna', body: 'obcy komentarz', created_at: new Date().toISOString(), author: { username: 'anna_gotuje' } }
    await b.addComment(mine.id, 'x', me) // upewnia się, że zapis działa
    await expect(b.deleteComment(stranger)).resolves.toBeUndefined()
  })
})

describe('tryb lokalny: profil ze zdjęciem, listy i liczniki na żywo', () => {
  it('zdjęcie profilowe: zapis, odczyt w autorze przepisów, usunięcie', async () => {
    await b.updateProfile({ avatar_url: 'data:image/jpeg;base64,AAAA' })
    expect((await b.getMyProfile())?.avatar_url).toBe('data:image/jpeg;base64,AAAA')
    const [r] = await b.profileRecipes((await b.getMyProfile())!, 0, 1)
    expect(r.author?.avatar_url).toBe('data:image/jpeg;base64,AAAA')
    await b.updateProfile({ avatar_url: null })
    expect((await b.getMyProfile())?.avatar_url).toBeUndefined()
  })

  it('lista obserwujących: po zaobserwowaniu ja jestem na liście cudzego profilu', async () => {
    const zosia = (await b.getProfile('kuchnia.zosi'))!
    await b.unfollow(zosia.id)
    expect((await b.listFollowers('kuchnia.zosi', 0, 20)).some((p) => p.is_me)).toBe(false)
    await b.follow(zosia.id)
    const followers = await b.listFollowers('kuchnia.zosi', 0, 20)
    expect(followers[0].is_me).toBe(true) // najnowszy na górze
    expect((await b.listFollowing('ty', 0, 20)).map((p) => p.username)).toContain('kuchnia.zosi')
    await b.unfollow(zosia.id)
  })

  it('profil prywatny: lista ukryta, własna lista widoczna', async () => {
    expect(await b.listFollowers('sekret', 0, 20)).toEqual([])
    expect(await b.listFollowing('sekret', 0, 20)).toEqual([])
    expect(await b.listFollowers('nie.ma', 0, 20)).toEqual([])
  })

  it('subscribeProfileCounts: zmiana obserwowania wysyła aktualne liczniki, a po odsubskrybowaniu cisza', async () => {
    const zosia = (await b.getProfile('kuchnia.zosi'))!
    await b.unfollow(zosia.id)
    const got: { followers_count: number; following_count: number }[] = []
    const stop = b.subscribeProfileCounts(zosia.id, (c) => got.push(c))

    await b.follow(zosia.id)
    emit('follows-changed')
    expect(got.at(-1)?.followers_count).toBe(zosia.followers_count + 1)

    await b.unfollow(zosia.id)
    emit('follows-changed')
    expect(got.at(-1)?.followers_count).toBe(zosia.followers_count)

    stop()
    const n = got.length
    emit('follows-changed')
    expect(got).toHaveLength(n)
  })

  it('własne liczniki: „obserwuje” rośnie razem z obserwowanymi', async () => {
    const meProfile = (await b.getMyProfile())!
    const anna = (await b.getProfile('anna_gotuje'))!
    const before = (await b.getProfile('ty'))!.following_count
    const seen: number[] = []
    const stop = b.subscribeProfileCounts(meProfile.id, (c) => seen.push(c.following_count))
    await b.follow(anna.id)
    emit('follows-changed')
    expect(seen.at(-1)).toBe(before + 1)
    await b.unfollow(anna.id)
    stop()
  })
})

describe('tryb lokalny: powiadomienia', () => {
  it('są przykładowe, od najnowszych, a oznaczenie zeruje licznik', async () => {
    const list = await b.listNotifications(0, 20)
    expect(list.length).toBeGreaterThanOrEqual(3)
    const times = list.map((n) => n.created_at)
    expect([...times].sort().reverse()).toEqual(times)
    expect(await b.countUnreadNotifications()).toBe(list.filter((n) => !n.read).length)
    await b.markNotificationsRead()
    expect(await b.countUnreadNotifications()).toBe(0)
  })

  it('nowe powiadomienie na żywo: subskrybent dostaje sygnał, licznik rośnie, po odsubskrybowaniu cisza', async () => {
    const { pushDemoNotification } = await import('../src/lib/localBackend')
    let n = 0
    const stop = b.subscribeNotifications(LOCAL_USER_ID, () => n++)
    pushDemoNotification('comment', 'marek_grilluje')
    expect(n).toBe(1)
    expect(await b.countUnreadNotifications()).toBe(1)
    const [first] = await b.listNotifications(0, 1)
    expect(first).toMatchObject({ type: 'comment', read: false, actor: { username: 'marek_grilluje' } })
    expect(first.comment_body).toBeTruthy()
    stop()
    pushDemoNotification('follow', 'kuchnia.zosi')
    expect(n).toBe(1)
  })

  it('getRecipe znajduje własny i cudzy publiczny przepis', async () => {
    const [mine] = await b.listMyRecipes()
    expect((await b.getRecipe(mine.id))?.id).toBe(mine.id)
    expect((await b.getRecipe('demo-anna-1'))?.author?.username).toBe('anna_gotuje')
    expect(await b.getRecipe('nie-ma')).toBeNull()
  })
})

describe('tryb lokalny: ostatni komentarz w statystykach', () => {
  it('to najnowszy komentarz z autorem; po dodaniu nowego zmienia się', async () => {
    const id = 'demo-marek-2'
    await b.addComment(id, 'pierwszy', me)
    await new Promise((r) => setTimeout(r, 5))
    const second = await b.addComment(id, 'drugi', { username: 'kuchnia.zosi' })
    const s = (await b.getRecipeStats([id]))[id]
    expect(s.last_comment).toMatchObject({ id: second.id, body: 'drugi', author: { username: 'kuchnia.zosi' } })
    await b.deleteComment(second)
    expect((await b.getRecipeStats([id]))[id].last_comment?.body).toBe('pierwszy')
  })
})
