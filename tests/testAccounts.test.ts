import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { actors, createDb } from './helpers/pg'

/** Konta testowe (supabase/test_accounts.sql) i panel admina: widoczność tylko dla admina z włączonym przełącznikiem */

const ADMIN = '00000000-0000-0000-0000-0000000000a1'
const USER = '00000000-0000-0000-0000-0000000000a2'

let db: PGlite
let as: ReturnType<typeof actors>['as']
let asOk: ReturnType<typeof actors>['asOk']

beforeAll(async () => {
  db = await createDb()
  ;({ as, asOk } = actors(db))
  for (const id of [ADMIN, USER]) await db.query('insert into auth.users (id, email) values ($1, $2)', [id, `${id}@x.pl`])
  await db.exec(`
    insert into public.profiles (id, username, is_public) values ('${ADMIN}', 'tk', true), ('${USER}', 'zwykly', true);
    insert into public.recipes (user_id, title, tags, ingredients) values ('${USER}', 'Zwykły przepis', '{obiad}', '[]'::jsonb);
  `)
  const seed = readFileSync('supabase/test_accounts.sql', 'utf8')
  await db.exec(seed)
  await db.exec(seed) // idempotentność
  // Admina dopisuje się w SQL Editorze; ponowne uruchomienie engagement.sql robi to dla konta „tk”
  await db.exec(readFileSync('supabase/engagement.sql', 'utf8'))
})

const usernames = async (uid: string, sql = `select username from public.profiles where username like 'test\\_%'`) =>
  (await as<{ username: string }>(uid, sql)).map((r) => r.username)

describe('dane testowe', () => {
  it('20 kont i 40 przepisów, bez duplikatów po ponownym uruchomieniu; dwa ostatnie konta prywatne', async () => {
    const r = await db.query<{ p: number; r: number; priv: number; t: number }>(
      `select (select count(*) from public.profiles where is_test)::int as p,
              (select count(*) from public.recipes where user_id in (select id from public.profiles where is_test))::int as r,
              (select count(*) from public.profiles where is_test and not is_public)::int as priv,
              (select count(*) from public.profiles where is_test and username !~ '^test_[a-z]+$')::int as t`,
    )
    expect(r.rows[0]).toEqual({ p: 20, r: 40, priv: 2, t: 0 })
  })

  it('wszystkie dane są poprawne wg ograniczeń bazy i mają zróżnicowane tagi', async () => {
    const tags = await db.query<{ n: number }>(`select count(distinct t)::int as n from public.recipes r, unnest(r.tags) t where r.user_id in (select id from public.profiles where is_test)`)
    expect(tags.rows[0].n).toBeGreaterThan(20)
  })
})

describe('widoczność: zwykły użytkownik nie widzi kont testowych', () => {
  it('profile, wyszukiwarka, get_profile, przepisy i feed', async () => {
    expect(await usernames(USER)).toEqual([])
    expect(await as(USER, `select * from public.search_profiles('test')`)).toHaveLength(0)
    expect(await as(USER, `select * from public.get_profile('test_ania')`)).toHaveLength(0)
    expect(await as(USER, `select * from public.recipes where user_id = '00000000-0000-4000-a000-000000000001'`)).toHaveLength(0)
    expect(await as(USER, `select * from public.search_recipes('spaghetti')`)).toHaveLength(0)
    const feed = await as<{ author_username: string }>(USER, `select * from public.feed('foryou', 's', 50, 0)`)
    expect(feed.some((r) => r.author_username.startsWith('test_'))).toBe(false)
    expect(await as(USER, `select * from public.admin_test_account_count()`)).toEqual([{ admin_test_account_count: 0 }]) // nie zdradza liczby
  })

  it('nie da się ukryć ani odkryć flagi z klienta; app_admins niedostępne dla obcych', async () => {
    expect(await asOk(USER, `update public.profiles set is_test = true where id = '${USER}'`)).toMatch(/permission denied/i)
    expect(await asOk(USER, `insert into public.app_admins (user_id) values ('${USER}')`)).toMatch(/permission denied/i)
    expect(await as(USER, 'select * from public.app_admins')).toHaveLength(0)
    expect(await asOk(USER, `update public.app_admins set show_test_accounts = true`)).toBeNull() // 0 wierszy
    expect((await as<{ v: boolean }>(USER, 'select public.can_see_test_accounts() as v'))[0].v).toBe(false)
    expect(await asOk(null, 'select public.can_see_test_accounts()')).toMatch(/permission denied/i)
  })
})

describe('admin „tk”', () => {
  it('engagement.sql dopisuje konto „tk” do administratorów', async () => {
    expect((await db.query<{ user_id: string }>('select user_id from public.app_admins')).rows.map((r) => r.user_id)).toEqual([ADMIN])
  })

  it('bez wpisu w app_admins konta testowe są niewidoczne nawet dla „tk”', async () => {
    await db.exec('delete from public.app_admins')
    expect(await usernames(ADMIN)).toEqual([])
  })

  it('po dopisaniu do app_admins widzi konta testowe, ich przepisy, wyszukiwarkę i feed Dla Ciebie', async () => {
    await db.exec(`insert into public.app_admins (user_id) select id from public.profiles where username = 'tk' on conflict do nothing`)
    expect((await usernames(ADMIN)).length).toBe(20)
    expect(await as(ADMIN, `select * from public.search_profiles('test_ania')`)).toHaveLength(1)
    expect(await as(ADMIN, `select * from public.get_profile('test_ania')`)).toHaveLength(1)
    expect(await as(ADMIN, `select * from public.search_recipes('spaghetti')`)).not.toHaveLength(0)
    const feed = await as<{ author_username: string }>(ADMIN, `select * from public.feed('foryou', 's', 50, 0)`)
    const fromTest = feed.filter((r) => r.author_username.startsWith('test_'))
    expect(fromTest.length).toBe(36) // 18 publicznych kont × 2 przepisy; prywatne konta nie trafiają do feedu
    expect((await as<{ n: number }>(ADMIN, 'select public.admin_test_account_count() as n'))[0].n).toBe(20)
  })

  it('wyłączenie przełącznika chowa wszystko, także liczniki widoczności; liczba kont zostaje znana adminowi', async () => {
    expect(await asOk(ADMIN, `update public.app_admins set show_test_accounts = false where user_id = '${ADMIN}'`)).toBeNull()
    expect(await usernames(ADMIN)).toEqual([])
    expect(await as(ADMIN, `select * from public.get_profile('test_ania')`)).toHaveLength(0)
    expect(await as(ADMIN, `select * from public.search_profiles('test')`)).toHaveLength(0)
    const feed = await as<{ author_username: string }>(ADMIN, `select * from public.feed('foryou', 's', 50, 0)`)
    expect(feed.some((r) => r.author_username.startsWith('test_'))).toBe(false)
    expect((await as<{ n: number }>(ADMIN, 'select public.admin_test_account_count() as n'))[0].n).toBe(20)
    expect(await asOk(ADMIN, `update public.app_admins set show_test_accounts = true where user_id = '${ADMIN}'`)).toBeNull()
    expect((await usernames(ADMIN)).length).toBe(20)
  })

  it('admin może zmienić tylko przełącznik (nie dopisze admina ani nie usunie wpisu)', async () => {
    expect(await asOk(ADMIN, `insert into public.app_admins (user_id) values ('${USER}')`)).toMatch(/permission denied/i)
    expect(await asOk(ADMIN, `update public.app_admins set user_id = '${USER}'`)).toMatch(/permission denied/i)
    expect(await asOk(ADMIN, `delete from public.app_admins`)).toMatch(/permission denied/i)
  })

  it('obserwowanie konta testowego nie zdradza go innym w listach', async () => {
    await as(ADMIN, `insert into public.follows (follower_id, followee_id) values ('${ADMIN}', '00000000-0000-4000-a000-000000000001')`)
    expect((await as(ADMIN, `select * from public.list_following('tk')`)).length).toBe(1)
    expect(await as(USER, `select * from public.list_following('tk')`)).toHaveLength(0)
    expect(await as(USER, `select * from public.list_followers('test_ania')`)).toHaveLength(0)
    await as(ADMIN, `delete from public.follows where follower_id = '${ADMIN}'`)
  })
})

describe('zabezpieczenie kolejności uruchamiania', () => {
  it('bez engagement.sql (brak kolumny is_test) skrypt kont testowych odmawia z czytelnym komunikatem i nic nie wstawia', async () => {
    const other = await createDb()
    await other.exec('drop policy profiles_select on public.profiles; alter table public.profiles drop column is_test;')
    await expect(other.exec(readFileSync('supabase/test_accounts.sql', 'utf8'))).rejects.toThrow(/engagement.sql/)
    expect((await other.query('select count(*)::int as n from auth.users')).rows[0]).toEqual({ n: 0 })
  })
})
