import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { actors, createDb } from './helpers/pg'

const A = '00000000-0000-0000-0000-0000000000a1' // publiczny, autor przepisów
const B = '00000000-0000-0000-0000-0000000000b2' // publiczny
const C = '00000000-0000-0000-0000-0000000000c3' // publiczny
const P = '00000000-0000-0000-0000-0000000000d4' // prywatny
const N = '00000000-0000-0000-0000-0000000000e5' // bez profilu
const R1 = '10000000-0000-0000-0000-000000000001' // przepis A
const R2 = '10000000-0000-0000-0000-000000000002' // przepis A
const RP = '10000000-0000-0000-0000-0000000000f1' // przepis prywatnego P

const HOST = 'https://abc.supabase.co/storage/v1/object/public/recipe-images'

let db: PGlite
let as: ReturnType<typeof actors>['as']
let asOk: ReturnType<typeof actors>['asOk']

const one = async <T>(uid: string | null, sql: string): Promise<T> => (await as<T>(uid, sql))[0]

beforeAll(async () => {
  db = await createDb()
  ;({ as, asOk } = actors(db))
  for (const id of [A, B, C, P, N]) await db.query('insert into auth.users (id, email) values ($1, $2)', [id, `${id}@x.pl`])
  await db.exec(`
    insert into public.profiles (id, username, full_name, is_public) values
      ('${A}', 'anna', 'Anna Kowalska', true),
      ('${B}', 'bartek', 'Bartek Nowak', true),
      ('${C}', 'celina', 'Celina Wiśniewska', true),
      ('${P}', 'prywatny', 'Ktoś Prywatny', false);
    insert into public.recipes (id, user_id, title, created_at) values
      ('${R1}', '${A}', 'Placki', '2026-09-01T10:00:00Z'),
      ('${R2}', '${A}', 'Żurek', '2026-09-02T10:00:00Z'),
      ('${RP}', '${P}', 'Tajny', '2026-09-03T10:00:00Z');
  `)
})

const counts = (id: string) =>
  db.query<{ followers_count: number; following_count: number }>('select followers_count, following_count from public.profiles where id = $1', [id]).then((r) => r.rows[0])

describe('liczniki obserwujących (triggery)', () => {
  it('rosną i maleją razem z follows', async () => {
    expect(await counts(A)).toEqual({ followers_count: 0, following_count: 0 })
    await as(B, `insert into public.follows (follower_id, followee_id) values ('${B}', '${A}')`)
    await as(C, `insert into public.follows (follower_id, followee_id) values ('${C}', '${A}')`)
    await as(A, `insert into public.follows (follower_id, followee_id) values ('${A}', '${B}')`)
    expect(await counts(A)).toEqual({ followers_count: 2, following_count: 1 })
    expect(await counts(B)).toEqual({ followers_count: 1, following_count: 1 })
    expect(await counts(C)).toEqual({ followers_count: 0, following_count: 1 })

    await as(C, `delete from public.follows where follower_id = '${C}' and followee_id = '${A}'`)
    expect(await counts(A)).toEqual({ followers_count: 1, following_count: 1 })
    expect(await counts(C)).toEqual({ followers_count: 0, following_count: 0 })
  })

  it('duplikat obserwowania nie zmienia liczników', async () => {
    expect(await asOk(B, `insert into public.follows (follower_id, followee_id) values ('${B}', '${A}')`)).toMatch(/duplicate|unique/i)
    expect(await counts(A)).toEqual({ followers_count: 1, following_count: 1 })
  })

  it('usunięcie konta koryguje liczniki innych', async () => {
    await db.query('insert into auth.users (id, email) values ($1, $2)', ['00000000-0000-0000-0000-0000000000f9', 'tmp@x.pl'])
    await db.exec(`insert into public.profiles (id, username) values ('00000000-0000-0000-0000-0000000000f9', 'tymczasowy')`)
    await as('00000000-0000-0000-0000-0000000000f9', `insert into public.follows (follower_id, followee_id) values ('00000000-0000-0000-0000-0000000000f9', '${A}')`)
    expect((await counts(A)).followers_count).toBe(2)
    await db.exec(`delete from auth.users where id = '00000000-0000-0000-0000-0000000000f9'`)
    expect((await counts(A)).followers_count).toBe(1)
  })

  it('klient nie może sam ustawić liczników ani innych chronionych kolumn', async () => {
    expect(await asOk(A, `update public.profiles set followers_count = 999 where id = '${A}'`)).toMatch(/permission denied/i)
    expect(await asOk(A, `update public.profiles set following_count = 999 where id = '${A}'`)).toMatch(/permission denied/i)
    expect(await asOk(A, `update public.profiles set created_at = now() where id = '${A}'`)).toMatch(/permission denied/i)
    expect(await asOk(N, `insert into public.profiles (id, username, followers_count) values ('${N}', 'oszust', 5000)`)).toMatch(/permission denied/i)
    expect(await asOk(A, `update public.profiles set full_name = 'Anna K.' where id = '${A}'`)).toBeNull()
    expect((await counts(A)).followers_count).toBe(1)
  })
})

describe('zdjęcie profilowe (awatar)', () => {
  it('dozwolony tylko adres z naszego bucketa w folderze właściciela', async () => {
    expect(await asOk(A, `update public.profiles set avatar_url = '${HOST}/${A}/avatar-1.jpg' where id = '${A}'`)).toBeNull()
    const bad = [
      `${HOST}/${B}/avatar.jpg`, // folder innego użytkownika
      `https://evil.example/avatar.jpg`, // obcy host
      `http://abc.supabase.co/storage/v1/object/public/recipe-images/${A}/a.jpg`, // bez https
      `https://abc.supabase.co/storage/v1/object/public/inne-wiadro/${A}/a.jpg`, // inny bucket
      `${HOST}/${A}/${'x'.repeat(400)}.jpg`, // za długi
    ]
    for (const url of bad) {
      expect(await asOk(A, `update public.profiles set avatar_url = '${url}' where id = '${A}'`), url.slice(0, 60)).toMatch(/profiles_avatar_url_valid|check/i)
    }
    expect(await asOk(A, `update public.profiles set avatar_url = null where id = '${A}'`)).toBeNull()
    await as(A, `update public.profiles set avatar_url = '${HOST}/${A}/avatar-1.jpg' where id = '${A}'`)
  })

  it('awatar wraca w profilu, wyszukiwaniu i listach', async () => {
    expect((await one<{ avatar_url: string }>(B, `select * from public.get_profile('anna')`)).avatar_url).toBe(`${HOST}/${A}/avatar-1.jpg`)
    expect((await one<{ avatar_url: string }>(B, `select * from public.search_profiles('anna')`)).avatar_url).toBe(`${HOST}/${A}/avatar-1.jpg`)
    const rows = await as<{ author_avatar_url: string | null }>(B, `select * from public.search_recipes('placki')`)
    expect(rows[0].author_avatar_url).toBe(`${HOST}/${A}/avatar-1.jpg`)
  })
})

describe('list_followers / list_following', () => {
  it('obserwujący i obserwowani z flagami dla zalogowanego', async () => {
    // po testach wyżej: B → A, A → B
    const followers = await as<{ username: string; is_following: boolean; is_me: boolean }>(C, `select * from public.list_followers('anna')`)
    expect(followers.map((f) => f.username)).toEqual(['bartek'])
    expect(followers[0].is_following).toBe(false) // C nie obserwuje Bartka
    expect(followers[0].is_me).toBe(false)

    const following = await as<{ username: string; is_me: boolean }>(B, `select * from public.list_following('anna')`)
    expect(following.map((f) => f.username)).toEqual(['bartek'])
    expect(following[0].is_me).toBe(true) // oglądający jest na liście
  })

  it('od najnowszego obserwowania, ze stronicowaniem', async () => {
    await as(C, `insert into public.follows (follower_id, followee_id, created_at) values ('${C}', '${A}', now() + interval '1 hour')`)
    const all = (await as<{ username: string }>(B, `select * from public.list_followers('anna')`)).map((r) => r.username)
    expect(all).toEqual(['celina', 'bartek'])
    expect((await as<{ username: string }>(B, `select * from public.list_followers('anna', 1, 0)`)).map((r) => r.username)).toEqual(['celina'])
    expect((await as<{ username: string }>(B, `select * from public.list_followers('anna', 1, 1)`)).map((r) => r.username)).toEqual(['bartek'])
    await as(C, `delete from public.follows where follower_id = '${C}' and followee_id = '${A}'`)
  })

  it('lista profilu prywatnego jest ukryta przed innymi, ale widoczna dla właściciela', async () => {
    await as(B, `insert into public.follows (follower_id, followee_id) values ('${B}', '${P}')`)
    expect(await as(C, `select * from public.list_followers('prywatny')`)).toHaveLength(0)
    expect(await as(C, `select * from public.list_following('prywatny')`)).toHaveLength(0)
    expect((await as<{ username: string }>(P, `select * from public.list_followers('prywatny')`)).map((r) => r.username)).toEqual(['bartek'])
    await as(B, `delete from public.follows where follower_id = '${B}' and followee_id = '${P}'`)
  })

  it('nieistniejący profil i brak dostępu dla anon', async () => {
    expect(await as(B, `select * from public.list_followers('nie.ma')`)).toHaveLength(0)
    expect(await asOk(null, `select * from public.list_followers('anna')`)).toMatch(/permission denied/i)
  })

  it('search_profiles sortuje po zapisanym liczniku obserwujących', async () => {
    const r = await as<{ username: string }>(C, `select * from public.search_profiles('')`)
    expect(r[0].username).toBe('anna') // 1 obserwujący, reszta 0 lub 1 — Anna ma dodatkowo dłuższą nazwę alfabetycznie pierwszą
  })
})

describe('polubienia', () => {
  it('można polubić widoczny przepis, tylko raz, tylko jako ja', async () => {
    expect(await asOk(B, `insert into public.recipe_likes (recipe_id) values ('${R1}')`)).toBeNull()
    expect(await asOk(B, `insert into public.recipe_likes (recipe_id) values ('${R1}')`)).toMatch(/duplicate|unique/i)
    expect(await asOk(C, `insert into public.recipe_likes (recipe_id, user_id) values ('${R1}', '${B}')`)).toMatch(/row-level security/i)
  })

  it('nie można polubić przepisu z profilu prywatnego, ani zobaczyć jego polubień', async () => {
    expect(await asOk(B, `insert into public.recipe_likes (recipe_id) values ('${RP}')`)).toMatch(/row-level security/i)
    await db.exec(`insert into public.recipe_likes (recipe_id, user_id) values ('${RP}', '${P}')`) // właściciel sam sobie
    expect(await as(B, `select * from public.recipe_likes where recipe_id = '${RP}'`)).toHaveLength(0)
    expect(await as(P, `select * from public.recipe_likes where recipe_id = '${RP}'`)).toHaveLength(1)
  })

  it('cofnąć można tylko własne polubienie', async () => {
    expect(await as(C, `delete from public.recipe_likes where recipe_id = '${R1}' returning user_id`)).toHaveLength(0)
    expect(await as(B, `delete from public.recipe_likes where recipe_id = '${R1}' returning user_id`)).toHaveLength(1)
  })

  it('anon nie widzi ani nie daje polubień', async () => {
    expect(await as(null, `select * from public.recipe_likes`)).toHaveLength(0)
    expect(await asOk(null, `insert into public.recipe_likes (recipe_id) values ('${R1}')`)).toBeTruthy()
  })
})

describe('komentarze', () => {
  let commentByB = ''
  let commentByC = ''

  it('dodawanie: treść 1–500 znaków, tylko jako ja, tylko pod widocznym przepisem', async () => {
    const b = await as<{ id: string }>(B, `insert into public.recipe_comments (recipe_id, body) values ('${R1}', 'Świetny przepis!') returning id`)
    commentByB = b[0].id
    const c = await as<{ id: string }>(C, `insert into public.recipe_comments (recipe_id, body) values ('${R1}', 'Zrobię w weekend') returning id`)
    commentByC = c[0].id

    expect(await asOk(B, `insert into public.recipe_comments (recipe_id, body) values ('${R1}', '')`)).toMatch(/check/i)
    expect(await asOk(B, `insert into public.recipe_comments (recipe_id, body) values ('${R1}', '   ')`)).toMatch(/check/i)
    expect(await asOk(B, `insert into public.recipe_comments (recipe_id, body) values ('${R1}', '${'x'.repeat(501)}')`)).toMatch(/check/i)
    expect(await asOk(B, `insert into public.recipe_comments (recipe_id, body) values ('${R1}', '${'x'.repeat(500)}')`)).toBeNull()
    expect(await asOk(B, `insert into public.recipe_comments (recipe_id, user_id, body) values ('${R1}', '${C}', 'podszywam się')`)).toMatch(/row-level security/i)
    expect(await asOk(B, `insert into public.recipe_comments (recipe_id, body) values ('${RP}', 'do prywatnego')`)).toMatch(/row-level security/i)
  })

  it('list_comments: od najnowszych, z autorem, ze stronicowaniem', async () => {
    const rows = await as<{ id: string; author_username: string; author_full_name: string; body: string }>(A, `select * from public.list_comments('${R1}')`)
    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r.author_username)).toContain('celina')
    const named = rows.find((r) => r.id === commentByB)!
    expect(named.author_username).toBe('bartek')
    expect(named.author_full_name).toBe('Bartek Nowak')
    const page = await as(A, `select * from public.list_comments('${R1}', 1, 0)`)
    expect(page).toHaveLength(1)
    // kolejność malejąca po czasie
    const times = (await as<{ created_at: string }>(A, `select created_at from public.list_comments('${R1}')`)).map((r) => +new Date(r.created_at))
    expect([...times].sort((x, y) => y - x)).toEqual(times)
  })

  it('usunąć może autor komentarza i autor przepisu, nikt inny; edycji nie ma', async () => {
    expect(await as(C, `delete from public.recipe_comments where id = '${commentByB}' returning id`)).toHaveLength(0) // obcy
    expect(await as(B, `update public.recipe_comments set body = 'zmiana' where id = '${commentByB}' returning id`)).toHaveLength(0) // brak polityki UPDATE
    expect(await as(B, `delete from public.recipe_comments where id = '${commentByB}' returning id`)).toHaveLength(1) // autor
    expect(await as(A, `delete from public.recipe_comments where id = '${commentByC}' returning id`)).toHaveLength(1) // autor przepisu
  })

  it('po ukryciu profilu (prywatny) komentarze znikają dla innych', async () => {
    await as(A, `update public.profiles set is_public = false where id = '${A}'`)
    expect(await as(B, `select * from public.list_comments('${R1}')`)).toHaveLength(0)
    expect(await asOk(B, `insert into public.recipe_comments (recipe_id, body) values ('${R1}', 'już nie')`)).toMatch(/row-level security/i)
    expect((await as(A, `select * from public.list_comments('${R1}')`)).length).toBeGreaterThan(0) // właściciel widzi
    await as(A, `update public.profiles set is_public = true where id = '${A}'`)
  })

  it('komentarze i polubienia znikają razem z przepisem', async () => {
    await db.exec(`insert into public.recipes (id, user_id, title) values ('10000000-0000-0000-0000-0000000000aa', '${A}', 'Do usunięcia')`)
    await as(B, `insert into public.recipe_likes (recipe_id) values ('10000000-0000-0000-0000-0000000000aa')`)
    await as(B, `insert into public.recipe_comments (recipe_id, body) values ('10000000-0000-0000-0000-0000000000aa', 'x')`)
    await as(A, `delete from public.recipes where id = '10000000-0000-0000-0000-0000000000aa'`)
    expect((await db.query(`select 1 from public.recipe_likes where recipe_id = '10000000-0000-0000-0000-0000000000aa'`)).rows).toHaveLength(0)
    expect((await db.query(`select 1 from public.recipe_comments where recipe_id = '10000000-0000-0000-0000-0000000000aa'`)).rows).toHaveLength(0)
  })
})

describe('recipe_stats', () => {
  it('liczby polubień i komentarzy oraz flaga „polubiłem”', async () => {
    await as(C, `insert into public.recipe_likes (recipe_id) values ('${R1}')`)
    await as(B, `insert into public.recipe_likes (recipe_id) values ('${R1}')`)
    await as(B, `insert into public.recipe_comments (recipe_id, body) values ('${R2}', 'ok')`)

    const forC = await as<{ recipe_id: string; like_count: number; comment_count: number; liked: boolean }>(
      C, `select * from public.recipe_stats(array['${R1}', '${R2}']::uuid[])`)
    const r1 = forC.find((r) => r.recipe_id === R1)!
    const r2 = forC.find((r) => r.recipe_id === R2)!
    expect(r1.like_count).toBe(2)
    expect(r1.liked).toBe(true)
    expect(r2).toMatchObject({ like_count: 0, comment_count: 1, liked: false })

    const forA = await as<{ recipe_id: string; liked: boolean }>(A, `select * from public.recipe_stats(array['${R1}']::uuid[])`)
    expect(forA[0].liked).toBe(false)
  })

  it('nieznane i niewidoczne przepisy dają zera; pusta tablica; limit 100', async () => {
    const unknown = await as<{ like_count: number; comment_count: number }>(
      B, `select * from public.recipe_stats(array['${RP}', '99999999-0000-0000-0000-000000000000']::uuid[])`)
    expect(unknown).toHaveLength(2)
    expect(unknown.every((r) => r.like_count === 0 && r.comment_count === 0)).toBe(true) // polubienie RP właściciela jest niewidoczne
    expect(await as(B, `select * from public.recipe_stats(array[]::uuid[])`)).toHaveLength(0)
    const many = await as(B, `select * from public.recipe_stats((select array_agg(gen_random_uuid()) from generate_series(1, 150)))`)
    expect(many).toHaveLength(100)
  })

  it('funkcje niedostępne dla anon', async () => {
    expect(await asOk(null, `select * from public.recipe_stats(array['${R1}']::uuid[])`)).toMatch(/permission denied/i)
    expect(await asOk(null, `select * from public.list_comments('${R1}')`)).toMatch(/permission denied/i)
  })
})

describe('feed z awatarem autora', () => {
  it('zwraca author_avatar_url', async () => {
    await as(B, `insert into public.follows (follower_id, followee_id) values ('${B}', '${A}') on conflict do nothing`)
    const rows = await as<{ author_username: string; author_avatar_url: string | null }>(B, `select * from public.feed('newest', '')`)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => r.author_username === 'anna' && r.author_avatar_url?.includes(`/${A}/`))).toBe(true)
  })
})
