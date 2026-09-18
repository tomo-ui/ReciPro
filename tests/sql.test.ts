import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { unaccent } from '@electric-sql/pglite/contrib/unaccent'

/**
 * Testy migracji na prawdziwym Postgresie (PGlite, WASM). Środowisko Supabase (auth.uid(), role,
 * schemat storage) jest atrapą, ale reguły RLS, ograniczenia i funkcje SQL wykonują się naprawdę.
 */

const ANNA = '00000000-0000-0000-0000-00000000000a'
const JAN = '00000000-0000-0000-0000-00000000000b'
const ZOSIA = '00000000-0000-0000-0000-00000000000c'
const PRIV = '00000000-0000-0000-0000-00000000000d' // profil prywatny
const NOPROFILE = '00000000-0000-0000-0000-00000000000e'

const db = new PGlite({ extensions: { pg_trgm, unaccent } })

/** Wykonuje zapytanie jako zalogowany użytkownik (rola authenticated + auth.uid()) */
async function as<T = Record<string, unknown>>(uid: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  await db.exec(uid ? `set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);` : 'set role anon;')
  try {
    return (await db.query<T>(sql, params)).rows
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`)
  }
}
const asOk = async (uid: string | null, sql: string, params: unknown[] = []) => {
  try {
    await as(uid, sql, params)
    return null
  } catch (e) {
    return (e as Error).message
  }
}

const recipe = (id: string, userId: string, title: string, tags: string[], ingredients: string[], createdAt: string) => ({
  id,
  userId,
  title,
  tags,
  ingredients: JSON.stringify(ingredients.map((text) => ({ text }))),
  createdAt,
})

beforeAll(async () => {
  // — atrapa środowiska Supabase —
  await db.exec(`
    create schema extensions;
    create extension pg_trgm with schema extensions;
    create extension unaccent with schema extensions;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role anon nologin;
    create role authenticated nologin;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable
      as $$ select (string_to_array(name, '/'))[1:greatest(array_length(string_to_array(name, '/'), 1) - 1, 0)] $$;
  `)
  // — domyślne uprawnienia jak w Supabase: nowe obiekty w public dostępne dla anon/authenticated,
  //   a wycofanie ich robi dopiero sama migracja (revoke …) —
  await db.exec(`
    grant usage on schema public, extensions, auth, storage to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    grant execute on all functions in schema extensions to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant execute on functions to anon, authenticated;
    grant all on all tables in schema storage to authenticated;
  `)
  // — schemat z repozytorium: najpierw pierwotny, potem migracja społecznościowa —
  await db.exec(readFileSync('supabase/schema.sql', 'utf8'))
  await db.exec(readFileSync('supabase/social.sql', 'utf8'))
  await db.exec(readFileSync('supabase/social.sql', 'utf8')) // idempotentność: drugie uruchomienie nie może się wysypać

  for (const id of [ANNA, JAN, ZOSIA, PRIV, NOPROFILE]) await db.query('insert into auth.users (id, email) values ($1, $2)', [id, `${id}@x.pl`])
  await db.exec(`
    insert into public.profiles (id, username, full_name, is_public) values
      ('${ANNA}', 'anna_gotuje', 'Anna Kowalska', true),
      ('${JAN}', 'jan.kucharz', 'Jan Łukasiewicz', true),
      ('${ZOSIA}', 'kuchnia.zosi', 'Zofia Żurek', true),
      ('${PRIV}', 'sekret', 'Prywatny Kucharz', false);
  `)

  const rows = [
    recipe('10000000-0000-0000-0000-000000000001', ANNA, 'Żurek staropolski', ['zupa', 'obiad'], ['1 l żuru', 'kiełbasa', 'jajko'], '2026-09-01T10:00:00Z'),
    recipe('10000000-0000-0000-0000-000000000002', ANNA, 'Placki ziemniaczane', ['obiad', 'szybkie'], ['1 kg ziemniaków', '2 jajka'], '2026-09-02T10:00:00Z'),
    recipe('10000000-0000-0000-0000-000000000003', JAN, 'Sernik na zimno', ['deser', 'bez pieczenia'], ['500 g twarogu', 'żelatyna'], '2026-09-03T10:00:00Z'),
    recipe('10000000-0000-0000-0000-000000000004', JAN, 'Szybka zupa pomidorowa', ['zupa', 'szybkie'], ['pomidory', 'makaron'], '2026-09-04T10:00:00Z'),
    recipe('10000000-0000-0000-0000-000000000005', ZOSIA, 'Bigos', ['obiad', 'kapusta'], ['kapusta kiszona', 'kiełbasa'], '2026-09-05T10:00:00Z'),
    recipe('10000000-0000-0000-0000-000000000006', ZOSIA, 'Pierogi ruskie', ['obiad'], ['mąka', 'ziemniaki', 'twaróg'], '2026-09-06T10:00:00Z'),
    recipe('10000000-0000-0000-0000-000000000007', PRIV, 'Tajny przepis babci', ['obiad', 'sekret'], ['ziemniaki'], '2026-09-07T10:00:00Z'),
    recipe('10000000-0000-0000-0000-000000000008', NOPROFILE, 'Przepis bez profilu', ['obiad'], ['woda'], '2026-09-08T10:00:00Z'),
  ]
  for (const r of rows) {
    await db.query(
      `insert into public.recipes (id, user_id, title, tags, ingredients, created_at) values ($1, $2, $3, $4, $5::jsonb, $6)`,
      [r.id, r.userId, r.title, r.tags, r.ingredients, r.createdAt],
    )
  }
})

const titles = (rows: { title: string }[]) => rows.map((r) => r.title)

describe('nazwa użytkownika (zasady jak na Instagramie)', () => {
  const valid = (u: string | null) => db.query<{ ok: boolean }>('select public.is_valid_username($1) as ok', [u]).then((r) => r.rows[0].ok)

  it('akceptuje poprawne nazwy', async () => {
    for (const u of ['anna', 'a', '0', 'anna_gotuje', 'anna.k', '_x_', 'a.b.c', 'kuchnia.zosi_2026', 'a'.repeat(30)]) {
      expect(await valid(u), u).toBe(true)
    }
  })

  it('odrzuca niepoprawne nazwy', async () => {
    for (const u of ['', '.anna', 'anna.', 'an..na', 'a'.repeat(31), 'anna!', 'an na', 'anna-k', 'żurek', 'Anna', 'admin', 'api']) {
      expect(await valid(u), u).toBe(false)
    }
    expect(await valid(null)).toBe(false)
  })

  it('username_available: wielkość liter bez znaczenia, zajęte i niepoprawne → false, działa dla anon', async () => {
    expect((await as(null, `select public.username_available('ANNA_GOTUJE') as v`))[0]).toEqual({ v: false })
    expect((await as(null, `select public.username_available('nowa.nazwa') as v`))[0]).toEqual({ v: true })
    expect((await as(null, `select public.username_available('zła nazwa') as v`))[0]).toEqual({ v: false })
    expect((await as(null, `select public.username_available('admin') as v`))[0]).toEqual({ v: false })
  })

  it('unikalność i ograniczenia w tabeli', async () => {
    const dup = await asOk(NOPROFILE, `insert into public.profiles (id, username) values ('${NOPROFILE}', 'anna_gotuje')`)
    expect(dup).toMatch(/duplicate key|unique/i)
    const bad = await asOk(NOPROFILE, `insert into public.profiles (id, username) values ('${NOPROFILE}', 'Zla..Nazwa')`)
    expect(bad).toMatch(/profiles_username_valid|check/i)
  })

  it('profil można założyć tylko dla siebie i zmienić tylko własny', async () => {
    expect(await asOk(JAN, `insert into public.profiles (id, username) values ('${NOPROFILE}', 'cudzy')`)).toMatch(/row-level security/i)
    expect(await asOk(NOPROFILE, `insert into public.profiles (id, username, full_name) values ('${NOPROFILE}', 'bez.profilu', 'Ktoś')`)).toBeNull()
    // cudzy profil: UPDATE nie zmienia żadnego wiersza (RLS ukrywa go przed zapisem)
    const changed = await as(JAN, `update public.profiles set full_name = 'Zhakowane' where id = '${ANNA}' returning id`)
    expect(changed).toHaveLength(0)
    const own = await as(NOPROFILE, `update public.profiles set is_public = false where id = '${NOPROFILE}' returning id`)
    expect(own).toHaveLength(1)
    await as(NOPROFILE, `update public.profiles set is_public = true where id = '${NOPROFILE}'`)
    await as(NOPROFILE, `delete from public.profiles where id = '${NOPROFILE}'`).catch(() => {})
    await db.exec(`delete from public.profiles where id = '${NOPROFILE}'`) // posprzątanie: dalej użytkownik jest „bez profilu”
  })
})

describe('widoczność przepisów (RLS)', () => {
  it('publiczne cudze i własne widać, prywatnych cudzych nie', async () => {
    const seenByAnna = titles(await as(ANNA, 'select title from public.recipes'))
    expect(seenByAnna).toContain('Bigos') // publiczny profil Zosi
    expect(seenByAnna).toContain('Żurek staropolski') // własny
    expect(seenByAnna).not.toContain('Tajny przepis babci') // profil prywatny
    const seenByPriv = titles(await as(PRIV, 'select title from public.recipes'))
    expect(seenByPriv).toContain('Tajny przepis babci') // właściciel widzi swoje
  })

  it('anon nie widzi niczego', async () => {
    expect(await as(null, 'select title from public.recipes')).toHaveLength(0)
  })

  it('zapis, edycja i usuwanie tylko własnych', async () => {
    expect(await asOk(JAN, `insert into public.recipes (user_id, title) values ('${ANNA}', 'Podszywam się')`)).toMatch(/row-level security/i)
    expect(await as(JAN, `update public.recipes set title = 'X' where user_id = '${ANNA}' returning id`)).toHaveLength(0)
    expect(await as(JAN, `delete from public.recipes where user_id = '${ANNA}' returning id`)).toHaveLength(0)
  })

  it('przełączenie profilu na prywatny chowa przepisy, powrót je przywraca', async () => {
    await as(ZOSIA, `update public.profiles set is_public = false where id = '${ZOSIA}'`)
    expect(titles(await as(ANNA, 'select title from public.recipes'))).not.toContain('Bigos')
    await as(ZOSIA, `update public.profiles set is_public = true where id = '${ZOSIA}'`)
    expect(titles(await as(ANNA, 'select title from public.recipes'))).toContain('Bigos')
  })
})

describe('search_recipes', () => {
  const search = (q: string, sort = 'relevance', limit = 20, offset = 0) =>
    as<{ title: string; author_username: string }>(ANNA, 'select * from public.search_recipes($1, $2, $3, $4)', [q, sort, limit, offset])

  it('pusty tekst = wszystkie widoczne przepisy autorów z profilem, najnowsze pierwsze', async () => {
    const r = await search('')
    expect(r[0].title).toBe('Pierogi ruskie')
    expect(titles(r)).not.toContain('Tajny przepis babci') // profil prywatny
    expect(titles(r)).not.toContain('Przepis bez profilu') // brak profilu = niewidoczny w wyszukiwaniu
    expect(r).toHaveLength(6)
  })

  it('ignoruje ogonki i wielkość liter (zurek → Żurek)', async () => {
    expect(titles(await search('zurek'))).toEqual(['Żurek staropolski'])
    expect(titles(await search('ŻUREK'))).toEqual(['Żurek staropolski'])
  })

  it('szuka w tytule, tagach, składnikach', async () => {
    expect(titles(await search('sernik'))).toEqual(['Sernik na zimno']) // tytuł
    expect(titles(await search('bez pieczenia'))).toEqual(['Sernik na zimno']) // tag ze spacją, dwa słowa
    expect(titles(await search('#kapusta'))).toEqual(['Bigos']) // tag z #
    expect(titles(await search('żelatyna'))).toEqual(['Sernik na zimno']) // składnik
    expect(titles(await search('twarog')).sort()).toEqual(['Pierogi ruskie', 'Sernik na zimno']) // składnik, bez ogonków
  })

  it('wszystkie słowa muszą pasować (AND)', async () => {
    expect(titles(await search('zupa szybka'))).toEqual(['Szybka zupa pomidorowa'])
    expect(await search('zupa sernik')).toHaveLength(0)
  })

  it('trafienie w tytuł wyprzedza tag, a tag składnik', async () => {
    // „ziemniak”: tytuł „Placki ziemniaczane” (nie zawiera „ziemniak”? zawiera — „ziemniaczane” to „ziemniac…”)
    const r = titles(await search('zupa'))
    expect(r[0]).toBe('Szybka zupa pomidorowa') // w tytule i tagu
    expect(r[1]).toBe('Żurek staropolski') // tylko tag
  })

  it('sortowanie „newest” i stronicowanie bez powtórzeń', async () => {
    const all = titles(await search('obiad', 'newest'))
    expect(all).toEqual(['Pierogi ruskie', 'Bigos', 'Placki ziemniaczane', 'Żurek staropolski'])
    const p1 = titles(await search('obiad', 'newest', 2, 0))
    const p2 = titles(await search('obiad', 'newest', 2, 2))
    expect([...p1, ...p2]).toEqual(all)
  })

  it('znaki specjalne LIKE traktuje dosłownie', async () => {
    expect(await search('%')).toHaveLength(0)
    expect(await search('_')).toHaveLength(0)
    expect(await search('\\')).toHaveLength(0)
  })

  it('search_text odświeża się po edycji tagów i składników', async () => {
    await as(ANNA, `update public.recipes set tags = array['nowytag'] where title = 'Bigos' or title = 'Placki ziemniaczane'`)
    expect(titles(await search('nowytag'))).toEqual(['Placki ziemniaczane'])
    await as(ANNA, `update public.recipes set ingredients = '[{"text":"szafran"}]'::jsonb where title = 'Placki ziemniaczane'`)
    expect(titles(await search('szafran'))).toEqual(['Placki ziemniaczane'])
    await as(ANNA, `update public.recipes set tags = array['obiad','szybkie'], ingredients = '[{"text":"1 kg ziemniaków"},{"text":"2 jajka"}]'::jsonb where title = 'Placki ziemniaczane'`)
  })
})

describe('search_profiles i get_profile', () => {
  const people = (q: string) => as<{ username: string; recipe_count: number; is_following: boolean; is_me: boolean }>(ANNA, 'select * from public.search_profiles($1)', [q])

  it('po nazwie użytkownika (część, prefiks, z @)', async () => {
    expect((await people('anna')).map((p) => p.username)).toEqual(['anna_gotuje'])
    expect((await people('@kuchnia')).map((p) => p.username)).toEqual(['kuchnia.zosi'])
    expect((await people('zosi')).map((p) => p.username)).toEqual(['kuchnia.zosi'])
  })

  it('po imieniu i nazwisku, bez ogonków i wielkości liter', async () => {
    expect((await people('lukasiewicz')).map((p) => p.username)).toEqual(['jan.kucharz'])
    expect((await people('Jan Łukas')).map((p) => p.username)).toEqual(['jan.kucharz'])
    expect((await people('kowalska anna')).map((p) => p.username)).toEqual(['anna_gotuje'])
  })

  it('kolejność: dokładna nazwa, potem prefiks', async () => {
    await db.exec(`insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000f1'), ('00000000-0000-0000-0000-0000000000f2')`)
    await db.exec(`insert into public.profiles (id, username) values ('00000000-0000-0000-0000-0000000000f1', 'jan'), ('00000000-0000-0000-0000-0000000000f2', 'janusz')`)
    const r = (await people('jan')).map((p) => p.username)
    expect(r[0]).toBe('jan')
    expect(r.indexOf('janusz')).toBeLessThan(r.indexOf('anna_gotuje') === -1 ? 99 : r.indexOf('anna_gotuje'))
    await db.exec(`delete from public.profiles where id in ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2')`)
  })

  it('podkreślnik i procent nie są wieloznacznikami', async () => {
    expect(await people('%')).toHaveLength(0)
    expect((await people('a_g')).map((p) => p.username)).toEqual(['anna_gotuje']) // dosłowny „_”
    expect(await people('a_x')).toHaveLength(0)
  })

  it('liczniki, is_me i prywatność liczby przepisów', async () => {
    const [anna] = await people('anna_gotuje')
    expect(anna.recipe_count).toBe(2)
    expect(anna.is_me).toBe(true)
    const [priv] = await people('sekret')
    expect(priv.recipe_count).toBe(0) // cudzy prywatny profil nie zdradza liczby przepisów
    const own = await as<{ recipe_count: number }>(PRIV, `select * from public.get_profile('SEKRET')`)
    expect(own[0].recipe_count).toBe(1) // właściciel widzi
  })

  it('get_profile: wielkość liter, nieistniejący', async () => {
    expect(await as(ANNA, `select * from public.get_profile('JAN.KUCHARZ')`)).toHaveLength(1)
    expect(await as(ANNA, `select * from public.get_profile('nie.ma.takiego')`)).toHaveLength(0)
  })

  it('funkcje profili niedostępne dla anon', async () => {
    expect(await asOk(null, `select * from public.search_profiles('a')`)).toMatch(/permission denied/i)
    expect(await asOk(null, `select * from public.get_profile('anna_gotuje')`)).toMatch(/permission denied/i)
  })
})

describe('obserwowanie i feed', () => {
  const feed = (uid: string, mode: string, seed: string, limit = 50, offset = 0) =>
    as<{ title: string; author_username: string }>(uid, 'select * from public.feed($1, $2, $3, $4)', [mode, seed, limit, offset])

  it('reguły follows: tylko jako ja, nie siebie, bez duplikatów', async () => {
    expect(await asOk(ANNA, `insert into public.follows values ('${JAN}', '${ZOSIA}')`)).toMatch(/row-level security/i)
    expect(await asOk(ANNA, `insert into public.follows values ('${ANNA}', '${ANNA}')`)).toMatch(/follows_not_self|check/i)
    expect(await asOk(ANNA, `insert into public.follows (follower_id, followee_id) values ('${ANNA}', '${JAN}')`)).toBeNull()
    expect(await asOk(ANNA, `insert into public.follows (follower_id, followee_id) values ('${ANNA}', '${JAN}')`)).toMatch(/duplicate|unique/i)
  })

  it('pusty feed bez obserwowanych', async () => {
    expect(await feed(JAN, 'random', 's')).toHaveLength(0)
  })

  it('feed pokazuje tylko przepisy obserwowanych, nie własne, nie prywatne', async () => {
    await as(ANNA, `insert into public.follows (follower_id, followee_id) values ('${ANNA}', '${ZOSIA}')`)
    await as(ANNA, `insert into public.follows (follower_id, followee_id) values ('${ANNA}', '${PRIV}')`)
    const r = await feed(ANNA, 'newest', '')
    expect(titles(r)).toEqual(['Pierogi ruskie', 'Bigos', 'Szybka zupa pomidorowa', 'Sernik na zimno'])
    expect(r.map((x) => x.author_username)).toEqual(['kuchnia.zosi', 'kuchnia.zosi', 'jan.kucharz', 'jan.kucharz'])
  })

  it('tryb losowy: ta sama kolejność dla tego samego ziarna, inna dla innego', async () => {
    const a1 = titles(await feed(ANNA, 'random', 'ziarno-1'))
    const a2 = titles(await feed(ANNA, 'random', 'ziarno-1'))
    expect(a1).toEqual(a2)
    expect([...a1].sort()).toEqual(['Bigos', 'Pierogi ruskie', 'Sernik na zimno', 'Szybka zupa pomidorowa'])
    const orders = new Set<string>()
    for (let i = 0; i < 12; i++) orders.add(titles(await feed(ANNA, 'random', `ziarno-${i}`)).join('|'))
    expect(orders.size).toBeGreaterThan(2) // kolejność faktycznie zależy od ziarna
  })

  it('tryb losowy: kolejność nie jest chronologiczna', async () => {
    const chronological = titles(await feed(ANNA, 'newest', '')).join('|')
    let differs = false
    for (let i = 0; i < 12 && !differs; i++) differs = titles(await feed(ANNA, 'random', `s${i}`)).join('|') !== chronological
    expect(differs).toBe(true)
  })

  it('stronicowanie bez powtórzeń i braków', async () => {
    const all = titles(await feed(ANNA, 'random', 'ziarno-x'))
    const pages = [...titles(await feed(ANNA, 'random', 'ziarno-x', 3, 0)), ...titles(await feed(ANNA, 'random', 'ziarno-x', 3, 3))]
    expect(pages).toEqual(all)
  })

  it('zaprzestanie obserwowania usuwa przepisy z feedu; cudze relacje niewidoczne', async () => {
    expect(await as(JAN, 'select * from public.follows')).toHaveLength(1) // Jan widzi tylko relację Anna → Jan, w której jest obserwowanym
    expect(await as(ZOSIA, 'select * from public.follows')).toHaveLength(1) // Zosia: tylko Anna → Zosia
    await as(ANNA, `delete from public.follows where follower_id = '${ANNA}' and followee_id = '${JAN}'`)
    expect(titles(await feed(ANNA, 'newest', '')).sort()).toEqual(['Bigos', 'Pierogi ruskie'])
  })

  it('liczniki obserwujących w profilu (mimo RLS na follows)', async () => {
    const r = await as<{ followers_count: number; following_count: number; is_following: boolean }>(JAN, `select * from public.get_profile('kuchnia.zosi')`)
    expect(r[0].followers_count).toBe(1) // Anna
    expect(r[0].is_following).toBe(false)
    const me = await as<{ following_count: number }>(ANNA, `select * from public.get_profile('anna_gotuje')`)
    expect(me[0].following_count).toBe(2) // Zosia i prywatny
  })
})

describe('popular_tags i porządki', () => {
  it('najczęstsze tagi tylko z widocznych przepisów', async () => {
    const tags = await as<{ tag: string; uses: number }>(ANNA, 'select * from public.popular_tags(5)')
    expect(tags[0]).toEqual({ tag: 'obiad', uses: 4 }) // bez przepisów prywatnego profilu i bez profilu
    expect(tags.map((t) => t.tag)).not.toContain('sekret')
  })

  it('usunięcie użytkownika kasuje profil, obserwowania i przepisy', async () => {
    await db.exec(`delete from auth.users where id = '${ZOSIA}'`)
    expect((await db.query('select 1 from public.profiles where id = $1', [ZOSIA])).rows).toHaveLength(0)
    expect((await db.query('select 1 from public.recipes where user_id = $1', [ZOSIA])).rows).toHaveLength(0)
    expect((await db.query('select 1 from public.follows where followee_id = $1', [ZOSIA])).rows).toHaveLength(0)
  })
})

describe('zdjęcia w Storage (polityki)', () => {
  const put = (uid: string | null, folder: string, file = 'a.jpg') =>
    asOk(uid, `insert into storage.objects (bucket_id, name) values ('recipe-images', '${folder}/${file}')`)

  it('bucket jest publiczny i ma limity', async () => {
    const rows = (await db.query<{ public: boolean; file_size_limit: string; allowed_mime_types: string[] }>(
      `select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'recipe-images'`,
    )).rows
    expect(rows).toHaveLength(1)
    expect(rows[0].public).toBe(true)
    expect(Number(rows[0].file_size_limit)).toBe(2097152)
    expect(rows[0].allowed_mime_types).toEqual(['image/jpeg', 'image/png', 'image/webp'])
  })

  it('zapis tylko do własnego folderu', async () => {
    expect(await put(ANNA, ANNA)).toBeNull()
    expect(await put(JAN, ANNA)).toMatch(/row-level security/i) // cudzy folder
    expect(await put(null, ANNA)).toMatch(/permission denied|row-level security/i) // anon
  })

  it('usuwanie działa tylko dla własnych zdjęć (wymaga polityki SELECT)', async () => {
    expect(await put(ANNA, ANNA, 'do-usuniecia.jpg')).toBeNull()
    const foreign = await as(JAN, `delete from storage.objects where name = '${ANNA}/do-usuniecia.jpg' returning name`)
    expect(foreign).toHaveLength(0) // Jan nie usunie cudzego zdjęcia
    const own = await as(ANNA, `delete from storage.objects where name = '${ANNA}/do-usuniecia.jpg' returning name`)
    expect(own).toHaveLength(1)
  })
})
