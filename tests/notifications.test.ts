import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { actors, createDb } from './helpers/pg'

const A = '00000000-0000-0000-0000-0000000000a1' // autor przepisów
const B = '00000000-0000-0000-0000-0000000000b2'
const C = '00000000-0000-0000-0000-0000000000c3'
const N = '00000000-0000-0000-0000-0000000000e5' // konto bez profilu
const R1 = '10000000-0000-0000-0000-000000000001' // przepis A
const R2 = '10000000-0000-0000-0000-000000000002' // przepis B

let db: PGlite
let as: ReturnType<typeof actors>['as']
let asOk: ReturnType<typeof actors>['asOk']

type Row = { id: string; type: string; is_read: boolean; actor_username: string; recipe_title: string | null; comment_body: string | null }
const list = (uid: string) => as<Row>(uid, 'select * from public.list_notifications(30, 0)')
const unread = async (uid: string) => (await as<{ n: number }>(uid, 'select public.unread_notification_count() as n'))[0].n
const total = async () => (await db.query<{ n: number }>('select count(*)::int as n from public.notifications')).rows[0].n

beforeAll(async () => {
  db = await createDb()
  ;({ as, asOk } = actors(db))
  for (const id of [A, B, C, N]) await db.query('insert into auth.users (id, email) values ($1, $2)', [id, `${id}@x.pl`])
  await db.exec(`
    insert into public.profiles (id, username, is_public) values ('${A}', 'anna', true), ('${B}', 'bartek', true), ('${C}', 'celina', true);
    insert into public.recipes (id, user_id, title) values ('${R1}', '${A}', 'Placki'), ('${R2}', '${B}', 'Żurek');
  `)
})

describe('powstawanie powiadomień', () => {
  it('polubienie: właściciel przepisu dostaje powiadomienie z osobą i przepisem', async () => {
    await as(B, `insert into public.recipe_likes (recipe_id) values ('${R1}')`)
    const [n] = await list(A)
    expect(n).toMatchObject({ type: 'like', is_read: false, actor_username: 'bartek', recipe_title: 'Placki', comment_body: null })
    expect(await unread(A)).toBe(1)
    expect(await list(B)).toEqual([]) // autor polubienia nic nie dostaje
  })

  it('komentarz: treść trafia do powiadomienia', async () => {
    await as(C, `insert into public.recipe_comments (recipe_id, body) values ('${R1}', 'Pycha!')`)
    const rows = await list(A)
    expect(rows[0]).toMatchObject({ type: 'comment', actor_username: 'celina', comment_body: 'Pycha!', recipe_title: 'Placki' })
    expect(rows).toHaveLength(2)
  })

  it('nowy obserwujący', async () => {
    await as(C, `insert into public.follows (follower_id, followee_id) values ('${C}', '${A}')`)
    const rows = await list(A)
    expect(rows[0]).toMatchObject({ type: 'follow', actor_username: 'celina', recipe_title: null })
    expect(rows).toHaveLength(3)
    expect(await unread(A)).toBe(3)
  })

  it('własne akcje nie generują powiadomień', async () => {
    const before = await total()
    await as(A, `insert into public.recipe_likes (recipe_id) values ('${R1}')`)
    await as(A, `insert into public.recipe_comments (recipe_id, body) values ('${R1}', 'sam sobie')`)
    expect(await total()).toBe(before)
  })

  it('konto bez profilu może polubić, ale nie tworzy powiadomienia (i nie psuje akcji)', async () => {
    const before = await total()
    expect(await asOk(N, `insert into public.recipe_likes (recipe_id) values ('${R1}')`)).toBeNull()
    expect(await total()).toBe(before)
  })
})

describe('porządek po cofnięciu akcji', () => {
  it('cofnięcie polubienia i obserwowania usuwa powiadomienie; ponowne daje nowe', async () => {
    await as(B, `delete from public.recipe_likes where recipe_id = '${R1}'`)
    await as(C, `delete from public.follows where follower_id = '${C}' and followee_id = '${A}'`)
    expect((await list(A)).map((r) => r.type)).toEqual(['comment'])

    await as(B, `insert into public.recipe_likes (recipe_id) values ('${R1}')`)
    expect((await list(A)).map((r) => r.type).sort()).toEqual(['comment', 'like'])
  })

  it('usunięcie komentarza usuwa powiadomienie, usunięcie przepisu też', async () => {
    await as(A, `delete from public.recipe_comments where body = 'Pycha!'`) // właściciel przepisu może usunąć
    expect((await list(A)).map((r) => r.type)).toEqual(['like'])
    await db.exec(`delete from public.recipes where id = '${R1}'`)
    expect(await list(A)).toEqual([])
  })
})

describe('odczyt, oznaczanie i uprawnienia', () => {
  it('oznaczenie jako przeczytane zeruje licznik; nowe znów go podnosi', async () => {
    await as(C, `insert into public.recipe_likes (recipe_id) values ('${R2}')`)
    await as(A, `insert into public.follows (follower_id, followee_id) values ('${A}', '${B}')`)
    expect(await unread(B)).toBe(2)
    await as(B, 'select public.mark_notifications_read()')
    expect(await unread(B)).toBe(0)
    expect((await list(B)).every((r) => r.is_read)).toBe(true)
    await as(A, `insert into public.recipe_comments (recipe_id, body) values ('${R2}', 'hej')`)
    expect(await unread(B)).toBe(1)
  })

  it('każdy widzi tylko swoje powiadomienia', async () => {
    expect(await list(C)).toEqual([])
    const direct = await as(C, 'select * from public.notifications')
    expect(direct).toEqual([])
    const bDirect = await as(B, 'select * from public.notifications')
    expect(bDirect.length).toBeGreaterThan(0)
  })

  it('klient nie tworzy powiadomień ani nie zmienia niczego poza read_at', async () => {
    expect(await asOk(B, `insert into public.notifications (recipient_id, actor_id, type) values ('${B}', '${C}', 'follow')`)).toMatch(/permission|policy/i)
    expect(await asOk(B, `update public.notifications set actor_id = '${A}'`)).toMatch(/permission/i)
    expect(await asOk(B, `update public.notifications set read_at = null`)).toBeNull()
    // cudzych nie da się ruszyć
    const before = await unread(B)
    await as(C, `update public.notifications set read_at = now()`)
    expect(await unread(B)).toBe(before)
    expect(before).toBeGreaterThan(0)
  })

  it('anon nie ma dostępu', async () => {
    expect(await asOk(null, 'select * from public.notifications')).toMatch(/permission/i)
    expect(await asOk(null, 'select * from public.list_notifications()')).toMatch(/permission/i)
  })

  it('własne powiadomienia można usunąć', async () => {
    await as(B, 'delete from public.notifications')
    expect(await list(B)).toEqual([])
  })
})
