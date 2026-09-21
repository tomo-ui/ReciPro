import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { actors, createDb } from './helpers/pg'

/** Książka kucharska: posty vs wpisy tylko w mojej książce, zapisywanie cudzych przepisów z oznaczeniem autora */

const A = '00000000-0000-0000-0000-0000000000c1'
const B = '00000000-0000-0000-0000-0000000000c2'
const POST = '20000000-0000-0000-0000-000000000001'
const PRIVATE = '20000000-0000-0000-0000-000000000002'
const COPY = '20000000-0000-0000-0000-000000000003'

let db: PGlite
let as: ReturnType<typeof actors>['as']
let asOk: ReturnType<typeof actors>['asOk']

beforeAll(async () => {
  db = await createDb()
  ;({ as, asOk } = actors(db))
  for (const id of [A, B]) await db.query('insert into auth.users (id, email) values ($1, $2)', [id, `${id}@x.pl`])
  await db.exec(`
    insert into public.profiles (id, username, is_public) values ('${A}', 'autorka', true), ('${B}', 'zbieracz', true);
    insert into public.recipes (id, user_id, title, tags, ingredients) values
      ('${POST}', '${A}', 'Bigos', '{obiad,kapusta}', '[]'::jsonb);
  `)
})

const titles = (rows: { title: string }[]) => rows.map((r) => r.title).sort()

describe('post kontra książka kucharska', () => {
  it('domyślnie przepis jest postem (istniejące przepisy się nie zmieniają)', async () => {
    const r = await db.query<{ is_post: boolean }>(`select is_post from public.recipes where id = '${POST}'`)
    expect(r.rows[0].is_post).toBe(true)
    expect(titles(await as(B, `select * from public.recipes`))).toEqual(['Bigos'])
  })

  it('wpis tylko w książce widzi wyłącznie autor: nie inni, nie profil, nie feed, nie wyszukiwarka, nie tagi', async () => {
    expect(await asOk(A, `insert into public.recipes (id, title, tags, is_post, ingredients) values ('${PRIVATE}', 'Sekretny sos', '{tajne}', false, '[]'::jsonb)`)).toBeNull()
    expect(titles(await as(A, 'select * from public.recipes'))).toEqual(['Bigos', 'Sekretny sos'])
    expect(titles(await as(B, 'select * from public.recipes'))).toEqual(['Bigos'])
    expect(await as(B, `select * from public.search_recipes('sekretny')`)).toHaveLength(0)
    expect(await as(A, `select * from public.search_recipes('sekretny')`)).toHaveLength(0) // wyszukiwarka to posty, także moje
    expect(titles(await as(B, `select * from public.feed('foryou', 's', 50, 0)`))).toEqual(['Bigos'])
    expect((await as<{ tag: string }>(A, 'select * from public.popular_tags(50)')).map((t) => t.tag)).not.toContain('tajne')
    const own = await as<{ recipe_count: number }>(A, `select * from public.get_profile('autorka')`)
    expect(own[0].recipe_count).toBe(1) // profil liczy tylko posty, także mój własny
  })
})

describe('zapisywanie cudzego przepisu do swojej książki', () => {
  const save = (extra = '', isPost = 'false') =>
    `insert into public.recipes (id, title, tags, is_post, ingredients, saved_from_user_id, saved_from_username, saved_from_recipe_id${extra ? ', ' + extra.split('=')[0] : ''})
     values ('${COPY}', 'Bigos', '{obiad,kapusta}', ${isPost}, '[]'::jsonb, '${A}', 'autorka', '${POST}'${extra ? ', ' + extra.split('=')[1] : ''})`

  it('kopia jest wpisem w książce z oznaczeniem autora; nie da się jej opublikować jako własny post', async () => {
    expect(await asOk(B, save('', 'true'))).toMatch(/recipes_saved_not_post|check/i)
    expect(await asOk(B, save())).toBeNull()
    const mine = await as<{ saved_from_username: string; saved_from_user_id: string; is_post: boolean }>(B, `select * from public.recipes where id = '${COPY}'`)
    expect(mine[0]).toMatchObject({ saved_from_username: 'autorka', saved_from_user_id: A, is_post: false })
  })

  it('kopia jest prywatna, a licznik postów zapisującego się nie zmienia; ten sam przepis tylko raz', async () => {
    expect(await as(A, `select * from public.recipes where id = '${COPY}'`)).toHaveLength(0)
    expect((await as<{ recipe_count: number }>(A, `select * from public.get_profile('zbieracz')`))[0].recipe_count).toBe(0)
    expect(await asOk(B, save().replace(COPY, '20000000-0000-0000-0000-000000000004'))).toMatch(/recipes_saved_once|duplicate|unique/i)
    expect(titles(await as(B, `select * from public.feed('foryou', 's', 50, 0)`))).toEqual(['Bigos']) // własne kopie nie wracają do feedu
  })

  it('kopia nie może zostać postem także przy edycji', async () => {
    expect(await asOk(B, `update public.recipes set is_post = true where id = '${COPY}'`)).toMatch(/recipes_saved_not_post|check/i)
  })

  it('usunięcie oryginału nie usuwa kopii; zostaje nazwa autora', async () => {
    await db.exec(`delete from public.recipes where id = '${POST}'`)
    const r = await db.query<{ saved_from_recipe_id: string | null; saved_from_username: string }>(`select saved_from_recipe_id, saved_from_username from public.recipes where id = '${COPY}'`)
    expect(r.rows[0]).toEqual({ saved_from_recipe_id: null, saved_from_username: 'autorka' })
  })

  it('zmiana wpisu z książki na post i z powrotem (własny przepis, bez zapisanego autora)', async () => {
    expect(await asOk(A, `update public.recipes set is_post = true where id = '${PRIVATE}'`)).toBeNull()
    expect(titles(await as(B, 'select * from public.recipes'))).toEqual(['Bigos', 'Sekretny sos']) // Bigos to własna kopia B
    expect(await asOk(A, `update public.recipes set is_post = false where id = '${PRIVATE}'`)).toBeNull()
    expect(await as(B, 'select * from public.recipes where id = $1', [PRIVATE])).toHaveLength(0)
  })
})
