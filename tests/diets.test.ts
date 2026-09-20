import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { actors, createDb } from './helpers/pg'

const A = '00000000-0000-0000-0000-0000000000a1' // publiczny
const B = '00000000-0000-0000-0000-0000000000b2' // publiczny
const P = '00000000-0000-0000-0000-0000000000d4' // prywatny profil

let db: PGlite
let as: ReturnType<typeof actors>['as']
let asOk: ReturnType<typeof actors>['asOk']

const meals = JSON.stringify([{ id: 'm1', name: 'Śniadanie', share: 100, items: [] }])
const insert = (uid: string, title: string, isPublic = false, extra = '') =>
  as<{ id: string }>(uid, `insert into public.diets (title, meals, is_public${extra ? ', ' + extra.split('=')[0] : ''}) values ('${title}', '${meals}'::jsonb, ${isPublic}${extra ? ', ' + extra.split('=')[1] : ''}) returning id`)

beforeAll(async () => {
  db = await createDb()
  ;({ as, asOk } = actors(db))
  for (const id of [A, B, P]) await db.query('insert into auth.users (id, email) values ($1, $2)', [id, `${id}@x.pl`])
  await db.exec(`
    insert into public.profiles (id, username, is_public) values ('${A}', 'anna', true), ('${B}', 'bartek', true), ('${P}', 'prywatny', false);
  `)
})

describe('widoczność diet', () => {
  let priv: string
  let shared: string
  let hidden: string

  it('właściciel widzi wszystkie swoje diety; user_id ustawia się sam', async () => {
    priv = (await insert(A, 'Prywatna'))[0].id
    shared = (await insert(A, 'Udostępniona', true))[0].id
    const mine = await as<{ user_id: string }>(A, 'select user_id from public.diets order by title')
    expect(mine).toHaveLength(2)
    expect(mine.every((d) => d.user_id === A)).toBe(true)
  })

  it('inni widzą tylko udostępnione diety właściciela z profilem publicznym', async () => {
    const seen = await as<{ id: string; title: string }>(B, 'select id, title from public.diets')
    expect(seen.map((d) => d.title)).toEqual(['Udostępniona'])
    expect(seen[0].id).toBe(shared)
    expect(await as(B, `select * from public.diets where id = '${priv}'`)).toEqual([])
  })

  it('dieta udostępniona przez osobę z profilem prywatnym nie jest widoczna', async () => {
    hidden = (await insert(P, 'Udostępniona, ale profil prywatny', true))[0].id
    expect(await as(B, `select * from public.diets where id = '${hidden}'`)).toEqual([])
    expect(await as(P, `select * from public.diets where id = '${hidden}'`)).toHaveLength(1)
  })

  it('anon nie ma dostępu', async () => {
    expect(await asOk(null, 'select * from public.diets')).toMatch(/permission denied/i)
  })
})

describe('zapis i uprawnienia', () => {
  it('nie da się dodać diety w cudzym imieniu ani zmienić właściciela', async () => {
    expect(await asOk(B, `insert into public.diets (user_id, title) values ('${A}', 'Podszywka')`)).toMatch(/row-level security/i)
    const [d] = await insert(B, 'Moja')
    expect(await asOk(B, `update public.diets set user_id = '${A}' where id = '${d.id}'`)).toMatch(/permission denied/i)
  })

  it('edytować i usuwać może tylko właściciel', async () => {
    const [d] = await insert(A, 'Do zmiany', true)
    await as(B, `update public.diets set title = 'Zhakowana' where id = '${d.id}'`)
    await as(B, `delete from public.diets where id = '${d.id}'`)
    expect((await as<{ title: string }>(A, `select title from public.diets where id = '${d.id}'`))[0].title).toBe('Do zmiany')

    await as(A, `update public.diets set title = 'Zmieniona', is_public = false where id = '${d.id}'`)
    expect((await as<{ title: string; updated_at: string; created_at: string }>(A, `select * from public.diets where id = '${d.id}'`))[0]).toMatchObject({ title: 'Zmieniona' })
    expect(await as(B, `select * from public.diets where id = '${d.id}'`)).toEqual([]) // wycofane udostępnienie

    await as(A, `delete from public.diets where id = '${d.id}'`)
    expect(await as(A, `select * from public.diets where id = '${d.id}'`)).toEqual([])
  })

  it('kopia od innej osoby zapamiętuje źródło i jest niezależna od oryginału', async () => {
    const [orig] = await insert(A, 'Dieta 2000', true)
    const source = JSON.stringify({ diet_id: orig.id, user_id: A, username: 'anna', title: 'Dieta 2000' })
    const [copy] = await as<{ id: string }>(B, `insert into public.diets (title, meals, source) values ('Dieta 2000', '${meals}'::jsonb, '${source}'::jsonb) returning id`)
    await as(A, `delete from public.diets where id = '${orig.id}'`)
    const row = (await as<{ source: { username: string } }>(B, `select source from public.diets where id = '${copy.id}'`))[0]
    expect(row.source.username).toBe('anna')
  })
})

describe('ograniczenia danych', () => {
  it('tytuł 1–120 znaków, posiłki muszą być tablicą, cele obiektem', async () => {
    expect(await asOk(A, `insert into public.diets (title) values ('   ')`)).toMatch(/check/i)
    expect(await asOk(A, `insert into public.diets (title) values ('${'x'.repeat(121)}')`)).toMatch(/check/i)
    expect(await asOk(A, `insert into public.diets (title, meals) values ('T', '{}'::jsonb)`)).toMatch(/check/i)
    expect(await asOk(A, `insert into public.diets (title, targets) values ('T', '[]'::jsonb)`)).toMatch(/check/i)
    expect(await asOk(A, `insert into public.diets (title) values ('Poprawna')`)).toBeNull()
  })

  it('zbyt duży dokument jest odrzucany', async () => {
    const big = JSON.stringify([{ id: 'm', name: 'x', share: 100, items: [{ pad: 'y'.repeat(320_000) }] }])
    expect(await asOk(A, `insert into public.diets (title, meals) values ('Duża', '${big}'::jsonb)`)).toMatch(/check/i)
  })

  it('usunięcie profilu usuwa jego diety', async () => {
    await insert(B, 'Znikająca')
    await db.exec(`delete from public.profiles where id = '${B}'`)
    expect((await db.query('select count(*)::int as n from public.diets where user_id = $1', [B])).rows[0]).toEqual({ n: 0 })
  })
})
