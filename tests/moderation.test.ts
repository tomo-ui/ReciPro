import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { actors, createDb } from './helpers/pg'

/** Blokady, zgłoszenia, zgody i limity zapytań — na prawdziwym Postgresie (PGlite), z RLS */

const ANNA = '00000000-0000-0000-0000-0000000000a1'
const JAN = '00000000-0000-0000-0000-0000000000b1'
const ZOSIA = '00000000-0000-0000-0000-0000000000c1'
const ADMIN = '00000000-0000-0000-0000-0000000000d1'

const R_ANNA = '20000000-0000-0000-0000-000000000001'
const R_JAN = '20000000-0000-0000-0000-000000000002'
const C_JAN_ON_ANNA = '30000000-0000-0000-0000-000000000001'
const C_ZOSIA_ON_ANNA = '30000000-0000-0000-0000-000000000002'

let db: PGlite
let as: ReturnType<typeof actors>['as']
let asOk: ReturnType<typeof actors>['asOk']

beforeAll(async () => {
  db = await createDb()
  ;({ as, asOk } = actors(db))
  for (const id of [ANNA, JAN, ZOSIA, ADMIN]) await db.query('insert into auth.users (id, email) values ($1, $2)', [id, `${id}@x.pl`])
  await db.exec(`
    insert into public.profiles (id, username, full_name, is_public) values
      ('${ANNA}', 'anna', 'Anna', true), ('${JAN}', 'jan', 'Jan', true),
      ('${ZOSIA}', 'zosia', 'Zosia', true), ('${ADMIN}', 'adm', 'Admin', true);
    insert into public.app_admins (user_id) values ('${ADMIN}');
    insert into public.recipes (id, user_id, title) values
      ('${R_ANNA}', '${ANNA}', 'Przepis Anny'), ('${R_JAN}', '${JAN}', 'Przepis Jana');
    insert into public.recipe_comments (id, recipe_id, user_id, body) values
      ('${C_JAN_ON_ANNA}', '${R_ANNA}', '${JAN}', 'Komentarz Jana'),
      ('${C_ZOSIA_ON_ANNA}', '${R_ANNA}', '${ZOSIA}', 'Komentarz Zosi');
    insert into public.recipe_likes (recipe_id, user_id) values ('${R_ANNA}', '${JAN}'), ('${R_ANNA}', '${ZOSIA}');
    insert into public.follows (follower_id, followee_id) values ('${ANNA}', '${JAN}'), ('${JAN}', '${ANNA}'), ('${ZOSIA}', '${ANNA}');
  `)
})

const titles = (rows: { title: string }[]) => rows.map((r) => r.title)

describe('blokowanie użytkowników', () => {
  it('przed blokadą wszystko jest widoczne', async () => {
    expect(titles(await as(ANNA, 'select title from public.recipes order by title'))).toEqual(['Przepis Anny', 'Przepis Jana'])
    expect(await as(ANNA, `select * from public.get_profile('jan')`)).toHaveLength(1)
    expect(await as(ANNA, 'select id from public.recipe_comments')).toHaveLength(2)
  })

  it('block_user: dla blokującego i zablokowanego znikają profile, przepisy, komentarze, polubienia i obserwowanie', async () => {
    await as(ANNA, `select public.block_user('${JAN}')`)

    // Anna nie widzi Jana
    expect(titles(await as(ANNA, 'select title from public.recipes'))).toEqual(['Przepis Anny'])
    expect(await as(ANNA, `select * from public.get_profile('jan')`)).toHaveLength(0)
    expect(await as(ANNA, `select * from public.search_profiles('jan')`)).toHaveLength(0)
    expect((await as<{ body: string }>(ANNA, 'select body from public.recipe_comments')).map((c) => c.body)).toEqual(['Komentarz Zosi'])
    expect(await as(ANNA, `select * from public.list_comments('${R_ANNA}')`)).toHaveLength(1)
    expect((await as<{ username: string }>(ANNA, `select username from public.list_likers('${R_ANNA}')`)).map((p) => p.username)).toEqual(['zosia'])
    expect((await as<{ like_count: number }>(ANNA, `select like_count from public.recipe_stats(array['${R_ANNA}'::uuid])`))[0].like_count).toBe(1)

    // …i odwrotnie: Jan nie widzi Anny ani jej przepisu
    expect(titles(await as(JAN, 'select title from public.recipes'))).toEqual(['Przepis Jana'])
    expect(await as(JAN, `select * from public.get_profile('anna')`)).toHaveLength(0)

    // Zosia (trzecia osoba) nic nie zauważa
    expect(titles(await as(ZOSIA, 'select title from public.recipes order by title'))).toEqual(['Przepis Anny', 'Przepis Jana'])
    expect(await as(ZOSIA, `select * from public.get_profile('jan')`)).toHaveLength(1)
  })

  it('blokada kończy obserwowanie w obie strony i poprawia liczniki; nie da się obserwować zablokowanego', async () => {
    const follows = await db.query<{ n: number }>(
      `select count(*)::int as n from public.follows where (follower_id = '${ANNA}' and followee_id = '${JAN}') or (follower_id = '${JAN}' and followee_id = '${ANNA}')`,
    )
    expect(follows.rows[0].n).toBe(0)
    // Zosia nadal obserwuje Annę → 1 obserwujący
    expect((await db.query<{ followers_count: number }>(`select followers_count from public.profiles where id = '${ANNA}'`)).rows[0].followers_count).toBe(1)

    expect(await asOk(ANNA, `insert into public.follows (follower_id, followee_id) values ('${ANNA}', '${JAN}')`)).toMatch(/row-level security/i)
    expect(await asOk(JAN, `insert into public.follows (follower_id, followee_id) values ('${JAN}', '${ANNA}')`)).toMatch(/row-level security/i)
  })

  it('zablokowany nie może komentować ani lubić przepisów blokującego', async () => {
    expect(await asOk(JAN, `insert into public.recipe_comments (recipe_id, user_id, body) values ('${R_ANNA}', '${JAN}', 'hej')`)).toMatch(/row-level security/i)
    expect(await asOk(JAN, `insert into public.recipe_likes (recipe_id, user_id) values ('${R_ANNA}', '${JAN}')`)).toMatch(/row-level security|duplicate/i)
  })

  it('list_blocked_users pokazuje tylko moje blokady; klient nie zapisuje do tabeli blocks bezpośrednio', async () => {
    expect((await as<{ username: string }>(ANNA, 'select username from public.list_blocked_users()')).map((p) => p.username)).toEqual(['jan'])
    expect(await as(JAN, 'select * from public.list_blocked_users()')).toHaveLength(0)
    expect(await as(JAN, 'select * from public.blocks')).toHaveLength(0) // blokujący widzi swoje; zablokowany nie widzi niczego
    expect(await asOk(ANNA, `insert into public.blocks (blocker_id, blocked_id) values ('${ANNA}', '${ZOSIA}')`)).toMatch(/permission denied/i)
  })

  it('walidacja: nie da się zablokować siebie, nieistniejącego ani bez logowania', async () => {
    expect(await asOk(ANNA, `select public.block_user('${ANNA}')`)).toMatch(/invalid user/)
    expect(await asOk(ANNA, `select public.block_user('99999999-9999-9999-9999-999999999999')`)).toMatch(/user not found/)
    expect(await asOk(null, `select public.block_user('${JAN}')`)).toMatch(/permission denied/i)
  })

  it('unblock_user przywraca widoczność (obserwowanie nie wraca samo)', async () => {
    await as(ANNA, `select public.unblock_user('${JAN}')`)
    expect(titles(await as(ANNA, 'select title from public.recipes order by title'))).toEqual(['Przepis Anny', 'Przepis Jana'])
    expect(await as(ANNA, `select * from public.get_profile('jan')`)).toHaveLength(1)
    expect(await as(ANNA, 'select * from public.list_blocked_users()')).toHaveLength(0)
    const f = await db.query<{ n: number }>(`select count(*)::int as n from public.follows where follower_id = '${ANNA}' and followee_id = '${JAN}'`)
    expect(f.rows[0].n).toBe(0)
  })

  it('blokada usuwa powiadomienia między stronami', async () => {
    await db.exec(`delete from public.notifications`)
    await db.exec(`insert into public.notifications (recipient_id, actor_id, type) values ('${ANNA}', '${ZOSIA}', 'follow')`)
    expect(await as(ANNA, 'select * from public.list_notifications()')).toHaveLength(1)
    await as(ANNA, `select public.block_user('${ZOSIA}')`)
    expect(await as(ANNA, 'select * from public.list_notifications()')).toHaveLength(0)
    await as(ANNA, `select public.unblock_user('${ZOSIA}')`)
  })
})

describe('zgłoszenia treści', () => {
  it('zgłoszenie przepisu, komentarza i profilu zapisuje fragment treści; duplikat nie tworzy drugiego wiersza', async () => {
    await as(JAN, `select public.report_content('recipe', '${R_ANNA}', 'copyright', 'to moje zdjęcie')`)
    await as(JAN, `select public.report_content('recipe', '${R_ANNA}', 'copyright', 'jeszcze raz')`)
    await as(JAN, `select public.report_content('comment', '${C_ZOSIA_ON_ANNA}', 'offensive')`)
    await as(JAN, `select public.report_content('profile', '${ZOSIA}', 'spam')`)
    const rows = await db.query<{ target_type: string; excerpt: string; target_user_id: string }>('select target_type, excerpt, target_user_id from public.reports order by target_type')
    expect(rows.rows).toHaveLength(3)
    expect(rows.rows.find((r) => r.target_type === 'recipe')?.excerpt).toBe('Przepis Anny')
    expect(rows.rows.find((r) => r.target_type === 'comment')?.excerpt).toBe('Komentarz Zosi')
    expect(rows.rows.find((r) => r.target_type === 'profile')?.target_user_id).toBe(ZOSIA)
  })

  it('walidacja: własna treść, nieistniejący cel, zły powód/typ i brak logowania są odrzucane', async () => {
    expect(await asOk(ANNA, `select public.report_content('recipe', '${R_ANNA}', 'spam')`)).toMatch(/cannot report own content/)
    expect(await asOk(JAN, `select public.report_content('recipe', '99999999-9999-9999-9999-999999999999', 'spam')`)).toMatch(/target not found/)
    expect(await asOk(JAN, `select public.report_content('recipe', '${R_ANNA}', 'nie-ma-takiego')`)).toMatch(/invalid reason/)
    expect(await asOk(JAN, `select public.report_content('diet', '${R_ANNA}', 'spam')`)).toMatch(/invalid type/)
    expect(await asOk(null, `select public.report_content('recipe', '${R_ANNA}', 'spam')`)).toMatch(/permission denied/i)
  })

  it('nie da się zgłosić prywatnego przepisu (z książki) ani przepisu z prywatnego profilu', async () => {
    await db.exec(`insert into public.recipes (id, user_id, title, is_post) values ('20000000-0000-0000-0000-000000000009', '${ANNA}', 'Prywatny wpis', false)`)
    expect(await asOk(JAN, `select public.report_content('recipe', '20000000-0000-0000-0000-000000000009', 'spam')`)).toMatch(/target not found/)
  })

  it('limit: najwyżej 20 zgłoszeń na godzinę', async () => {
    await db.exec(`delete from public.reports where reporter_id = '${ZOSIA}'`)
    for (let i = 0; i < 20; i++) {
      await db.exec(`insert into public.reports (reporter_id, target_type, target_id, reason) values ('${ZOSIA}', 'recipe', gen_random_uuid(), 'spam')`)
    }
    expect(await asOk(ZOSIA, `select public.report_content('recipe', '${R_JAN}', 'spam')`)).toMatch(/too many reports/)
    await db.exec(`delete from public.reports where reporter_id = '${ZOSIA}'`)
  })

  it('tabeli reports nie da się czytać ani zapisywać z klienta', async () => {
    expect(await asOk(JAN, 'select * from public.reports')).toMatch(/permission denied/i)
    expect(await asOk(JAN, `insert into public.reports (reporter_id, target_type, target_id, reason) values ('${JAN}', 'recipe', '${R_ANNA}', 'spam')`)).toMatch(/permission denied/i)
  })
})

describe('panel moderacji (admin)', () => {
  it('zwykły użytkownik nie ma dostępu do listy, rozstrzygania ani licznika', async () => {
    expect(await asOk(JAN, `select * from public.admin_list_reports()`)).toMatch(/permission denied/)
    expect(await asOk(JAN, `select public.admin_resolve_report(gen_random_uuid(), 'dismiss')`)).toMatch(/permission denied/)
    expect((await as<{ c: number }>(JAN, 'select public.admin_open_report_count() as c'))[0].c).toBe(0)
  })

  it('admin widzi otwarte zgłoszenia (od najstarszych) z autorem, zgłaszającym i liczbą zgłoszeń tej treści', async () => {
    await as(ZOSIA, `select public.report_content('recipe', '${R_ANNA}', 'spam')`)
    expect((await as<{ c: number }>(ADMIN, 'select public.admin_open_report_count() as c'))[0].c).toBe(4)
    const list = await as<{ target_type: string; target_username: string; reporter_username: string; reports_count: number }>(ADMIN, `select * from public.admin_list_reports('open')`)
    const recipeRow = list.find((r) => r.target_type === 'recipe')
    expect(recipeRow).toMatchObject({ target_username: 'anna', reports_count: 2 })
    expect(['jan', 'zosia']).toContain(recipeRow?.reporter_username)
  })

  it('remove_content kasuje przepis i zamyka wszystkie otwarte zgłoszenia tej treści', async () => {
    const [rep] = await as<{ id: string }>(ADMIN, `select id from public.admin_list_reports('open') where target_type = 'recipe'`)
    await as(ADMIN, `select public.admin_resolve_report('${rep.id}', 'remove_content')`)
    expect(await db.query(`select 1 from public.recipes where id = '${R_ANNA}'`).then((r) => r.rows)).toHaveLength(0)
    const open = await as<{ target_type: string }>(ADMIN, `select * from public.admin_list_reports('open')`)
    expect(open.map((r) => r.target_type)).not.toContain('recipe')
    const resolved = await as<{ action: string }>(ADMIN, `select * from public.admin_list_reports('resolved')`)
    expect(resolved.map((r) => r.action)).toEqual(['remove_content', 'remove_content'])
  })

  it('dismiss odrzuca tylko to zgłoszenie; remove_content na profilu jest niedozwolone; zła akcja jest odrzucana', async () => {
    const [prof] = await as<{ id: string }>(ADMIN, `select id from public.admin_list_reports('open') where target_type = 'profile'`)
    expect(await asOk(ADMIN, `select public.admin_resolve_report('${prof.id}', 'remove_content')`)).toMatch(/profile cannot be removed/)
    expect(await asOk(ADMIN, `select public.admin_resolve_report('${prof.id}', 'wymysl')`)).toMatch(/invalid action/)
    await as(ADMIN, `select public.admin_resolve_report('${prof.id}', 'dismiss')`)
    const dismissed = await as<{ status: string }>(ADMIN, `select * from public.admin_list_reports('dismissed')`)
    expect(dismissed).toHaveLength(1)
  })

  it('komentarz usunięty przez moderatora znika; usunięcie konta zgłaszanego zostawia zgłoszenie (target_user_id = null)', async () => {
    const [c] = await as<{ id: string }>(ADMIN, `select id from public.admin_list_reports('open') where target_type = 'comment'`)
    // przepis Anny został wcześniej usunięty razem z komentarzami → cel zgłoszenia już nie istnieje, rozstrzygnięcie nie zawodzi
    await as(ADMIN, `select public.admin_resolve_report('${c.id}', 'remove_content')`)
    await db.exec(`delete from auth.users where id = '${JAN}'`)
    const all = await as<{ reporter_username: string | null }>(ADMIN, `select * from public.admin_list_reports('all')`)
    expect(all.length).toBeGreaterThan(0)
  })
})

describe('zgoda na AI', () => {
  it('set_ai_consent zapisuje i cofa zgodę; każdy widzi wyłącznie własną', async () => {
    expect(await as(ANNA, 'select * from public.user_consents')).toHaveLength(0)
    await as(ANNA, 'select public.set_ai_consent(true, 3)')
    const mine = await as<{ ai_consent_at: string | null; ai_consent_version: number }>(ANNA, 'select ai_consent_at, ai_consent_version from public.user_consents')
    expect(mine[0].ai_consent_at).not.toBeNull()
    expect(mine[0].ai_consent_version).toBe(3)
    expect(await as(ZOSIA, 'select * from public.user_consents')).toHaveLength(0)

    await as(ANNA, 'select public.set_ai_consent(false)')
    expect((await as<{ ai_consent_at: string | null }>(ANNA, 'select ai_consent_at from public.user_consents'))[0].ai_consent_at).toBeNull()
  })

  it('klient nie zapisze zgody wprost do tabeli ani bez logowania', async () => {
    expect(await asOk(ANNA, `insert into public.user_consents (user_id, ai_consent_at) values ('${ANNA}', now())`)).toMatch(/permission denied/i)
    expect(await asOk(null, 'select public.set_ai_consent(true)')).toMatch(/permission denied/i)
  })
})

describe('limity zapytań (consume_rate_limit)', () => {
  const consume = async (key: string, limit: number, window: number) =>
    (await db.query<{ ok: boolean }>('select public.consume_rate_limit($1, $2, $3) as ok', [key, limit, window])).rows[0].ok

  it('przepuszcza do limitu, potem odmawia, a klucze są niezależne', async () => {
    expect(await consume('test:a', 3, 60)).toBe(true)
    expect(await consume('test:a', 3, 60)).toBe(true)
    expect(await consume('test:a', 3, 60)).toBe(true)
    expect(await consume('test:a', 3, 60)).toBe(false)
    expect(await consume('test:b', 3, 60)).toBe(true)
  })

  it('zdarzenia spoza okna czasowego nie liczą się do limitu', async () => {
    await db.exec(`insert into public.rate_limit_events (key, created_at) values ('test:old', now() - interval '2 hours'), ('test:old', now() - interval '2 hours')`)
    expect(await consume('test:old', 2, 3600)).toBe(true)
    expect(await consume('test:old', 2, 3600)).toBe(true)
    expect(await consume('test:old', 2, 3600)).toBe(false)
  })

  it('odrzuca nieprawidłowe argumenty; klient (authenticated/anon) nie może jej wywołać ani czytać tabeli', async () => {
    expect(await db.query(`select public.consume_rate_limit('x', 0, 60)`).catch((e: Error) => e.message)).toMatch(/invalid rate limit/)
    expect(await asOk(ANNA, `select public.consume_rate_limit('x', 5, 60)`)).toMatch(/permission denied/i)
    expect(await asOk(null, `select public.consume_rate_limit('x', 5, 60)`)).toMatch(/permission denied/i)
    expect(await asOk(ANNA, 'select * from public.rate_limit_events')).toMatch(/permission denied/i)
  })
})

describe('ponowne uruchamianie migracji w innej kolejności', () => {
  it('notifications.sql po badges.sql nie wywala się, a badges.sql odtwarza wersję ze znaczkiem', async () => {
    const { readFileSync } = await import('node:fs')
    await db.exec(readFileSync('supabase/notifications.sql', 'utf8'))
    await db.exec(readFileSync('supabase/badges.sql', 'utf8'))
    await db.exec(`insert into public.notifications (recipient_id, actor_id, type) values ('${ANNA}', '${ZOSIA}', 'follow') on conflict do nothing`)
    // funkcja działa i zwraca kolumnę znaczka autora powiadomienia
    const rows = await as<Record<string, unknown>>(ANNA, 'select * from public.list_notifications()')
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => 'actor_verified_badge' in r)).toBe(true)
  })
})
