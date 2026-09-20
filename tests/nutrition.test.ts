import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildFoodDb, cleanedName, shortName, stem, type FoodData, type FoodDb } from '../src/lib/foodDb'
import { ALIASES } from '../src/lib/foodAliases'
import { IDX, macroShares, saltGrams } from '../src/lib/nutrients'
import { analyzeLine, analyzeRecipe, kcalPerServing, withAmount } from '../src/lib/nutrition'
import { adaptRecipe, isReached } from '../src/lib/adapt'
import { DEFAULT_PREFS, mealTarget, PRESETS, sanitize } from '../src/lib/prefs'

let db: FoodDb
beforeAll(() => {
  db = buildFoodDb(JSON.parse(readFileSync('src/data/foods.json', 'utf8')) as FoodData)
})

const lines = (...t: string[]) => t.map((text) => ({ text }))
const nameOf = (text: string) => analyzeLine({ text }, db).food?.name ?? ''

describe('baza składników', () => {
  it('ma ponad 7 tysięcy produktów, każdy z pełnym zestawem wartości i nazwą', () => {
    expect(db.size).toBeGreaterThan(7000)
    expect(db.foods.every((f) => f.n.length === 24 && f.name.length > 0 && f.n.every(Number.isFinite))).toBe(true)
  })

  it('kalorie zgadzają się z makroskładnikami (4/9/4 kcal/g) dla ogromnej większości produktów', () => {
    const solid = db.foods.filter((f) => f.n[IDX.kcal] > 50 && !/Alcoholic/.test(f.catEn))
    const ok = solid.filter((f) => {
      const est = f.n[IDX.protein] * 4 + f.n[IDX.fat] * 9 + f.n[IDX.carbs] * 4
      return Math.abs(est - f.n[IDX.kcal]) <= f.n[IDX.kcal] * 0.3 + 15
    })
    expect(ok.length / solid.length).toBeGreaterThan(0.95)
  })

  it('każdy alias wskazuje istniejący produkt', () => {
    const missing = ALIASES.filter(([, en]) => !db.find(en)).map(([, en]) => en)
    expect(missing).toEqual([])
  })

  it('zna przykładowe wartości: jajko, mąka, masło', () => {
    const egg = db.find('Egg, whole, raw, fresh')!
    expect(egg.n[IDX.kcal]).toBeCloseTo(143, 0)
    expect(egg.n[IDX.protein]).toBeCloseTo(12.56, 1)
    expect(db.find('Wheat flour, white, all-purpose, enriched, bleached')!.n[IDX.kcal]).toBeCloseTo(364, 0)
    expect(db.find('Butter, salted')!.n[IDX.kcal]).toBeCloseTo(717, 0)
  })
})

describe('wyszukiwanie po polsku', () => {
  it('rdzeń słowa łączy odmiany', () => {
    expect(stem('mąki')).toBe(stem('mąka'))
    expect(stem('pomidorów')).toBe(stem('pomidory'))
    expect(cleanedName('świeżej posiekanej pietruszki (opcjonalnie)')).toBe('swiezej posiekanej pietruszki')
  })

  it('szuka po nazwie, także w odmianie i po angielsku', () => {
    expect(db.search('mąka', { limit: 5 })[0].name).toMatch(/^Mąka/)
    expect(db.search('mąki pszennej')[0].name).toMatch(/Mąka pszenna, biała/) // popularny składnik na pierwszym miejscu
    expect(db.search('mąka pszenna', { limit: 40 }).length).toBeGreaterThan(5)
    expect(db.search('kurczak pierś')[0].name).toMatch(/kurcz/i)
    expect(db.search('chicken breast')[0].en).toMatch(/Chicken/)
    expect(db.search('')).toEqual([])
    expect(db.search('xqzvw')).toEqual([])
  })

  it('wszystkie słowa zapytania muszą pasować, a wyniki są ograniczone limitem', () => {
    const r = db.search('ser mozzarella', { limit: 3 })
    expect(r.length).toBeLessThanOrEqual(3)
    expect(r.every((f) => /mozzarell/i.test(f.name))).toBe(true)
  })

  it('krótka nazwa do wstawienia w linię', () => {
    expect(shortName(db.find('Cheese, mozzarella, whole milk')!)).toBe('ser mozzarella')
    expect(shortName(db.find('Onions, raw')!)).toBe('cebula')
  })
})

describe('dopasowanie linii składników', () => {
  it.each([
    ['200 g mąki pszennej', /Mąka pszenna, biała/],
    ['250 ml mleka', /Mleko, pełne/],
    ['2 jajka', /Jajko, całe/],
    ['100 g masła', /Masło, solone/],
    ['30 ml oliwy z oliwek', /Olej, z oliwek/],
    ['3 ząbki czosnku', /Czosnek, surowy/],
    ['300 g piersi z kurczaka', /Kurczak.*pierś/],
    ['200 g makaronu spaghetti', /Makaron, suchy/],
    ['100 g sera żółtego', /cheddar/],
    ['100 g cukru pudru', /puder/],
    ['300 g białej kiełbasy', /kiełbas/i],
    ['500 g mięsa mielonego wieprzowego', /Wieprzowina, świeża, mielona/],
    ['200 g ziemniaków', /Ziemniaki/],
    ['1 l żuru', /^$/],
  ])('%s', (line, expected) => expect(nameOf(line)).toMatch(expected))

  it('gramy, mililitry i sztuki przeliczają się na wagę', () => {
    expect(analyzeLine({ text: '200 g mąki' }, db).grams).toBe(200)
    const milk = analyzeLine({ text: '250 ml mleka' }, db)
    expect(milk.grams).toBeGreaterThan(250) // mleko jest gęstsze od wody
    expect(milk.grams).toBeLessThan(270)
    expect(analyzeLine({ text: '2 jajka' }, db).grams).toBeGreaterThan(90)
    expect(analyzeLine({ text: '3 ząbki czosnku' }, db).grams).toBeCloseTo(9, 0)
  })

  it('linia bez ilości i nieznany produkt dostają status, a nie liczby', () => {
    expect(analyzeLine({ text: 'sól do smaku' }, db)).toMatchObject({ status: 'no-amount', nutrients: null })
    expect(analyzeLine({ text: '1 l żuru' }, db)).toMatchObject({ status: 'no-match', nutrients: null })
  })

  it('produkt wskazany ręcznie (food_id) wygrywa z automatem', () => {
    const butter = db.find('Butter, salted')!
    const a = analyzeLine({ text: '100 g mąki', food_id: butter.id }, db)
    expect(a.manual).toBe(true)
    expect(a.food?.id).toBe(butter.id)
    expect(a.nutrients![IDX.kcal]).toBeCloseTo(717, 0)
  })
})

describe('wartości odżywcze przepisu', () => {
  const pancakes = lines('300 g mąki pszennej', '2 jajka', '500 ml mleka', '30 g cukru', 'szczypta soli', 'olej do smażenia')

  it('sumuje składniki i liczy na porcję', () => {
    const r = analyzeRecipe(pancakes, db, 4)
    expect(r.counted).toBe(5)
    expect(r.withAmount).toBe(5) // „olej do smażenia” nie ma ilości
    expect(r.total[IDX.kcal]).toBeGreaterThan(3 * 364)
    expect(r.perServing![IDX.kcal]).toBeCloseTo(r.total[IDX.kcal] / 4, 5)
    expect(kcalPerServing(r)).toBe(Math.round(r.total[IDX.kcal] / 4))
  })

  it('bez liczby porcji podaje całość; przy braku danych nie zgaduje kalorii', () => {
    expect(analyzeRecipe(pancakes, db).perServing).toBeNull()
    expect(kcalPerServing(analyzeRecipe(lines('1 l żuru', 'sól'), db, 2))).toBeNull()
  })

  it('makro w procentach kalorii sumują się do 100, sól z sodu', () => {
    const r = analyzeRecipe(pancakes, db, 4)
    const shares = macroShares(r.total)
    expect(shares.protein + shares.fat + shares.carbs).toBeCloseTo(100, 5)
    expect(saltGrams(2000)).toBeCloseTo(5, 5)
  })
})

describe('zmiana gramatury w linii', () => {
  it.each([
    ['200 g mąki', 150, '150 g mąki'],
    ['250 ml mleka', 300, '300 ml mleka'],
    ['200 g mąki', 1500, '1,5 kg mąki'],
    ['2 jajka', 3, '2 jajka'], // sztuki zostają bez zmian
  ])('%s → %s', (text, amount, expected) => expect(withAmount(text, amount)).toBe(expected))
})

describe('dopasowanie przepisu do celów', () => {
  const dish = lines('200 g makaronu', '150 g piersi z kurczaka', '50 g sera żółtego', '30 ml oliwy z oliwek', '100 g pomidorów', '2 g soli', '3 ząbki czosnku')
  const target = mealTarget({ ...DEFAULT_PREFS, kcalPerDay: 2000, mealsPerDay: 4 })

  it('cele na posiłek wynikają z kalorii i proporcji makro', () => {
    expect(target.kcal).toBe(500)
    expect(target.protein).toBeCloseTo(25, 5)
    expect(target.fat).toBeCloseTo((500 * 0.3) / 9, 5)
    expect(target.carbs).toBeCloseTo(62.5, 5)
  })

  it('tryb kcal: skaluje wszystko, żeby porcja miała docelowe kalorie', () => {
    const r = adaptRecipe(dish, 2, db, target, { mode: 'kcal' })
    expect(r.after[IDX.kcal]).toBeGreaterThan(475)
    expect(r.after[IDX.kcal]).toBeLessThan(525)
    expect(r.factor).toBeDefined()
    expect(r.changes.length).toBeGreaterThan(0)
    expect(r.ingredients).toHaveLength(dish.length)
  })

  it('tryb makro: zbliża się do celu, zmienia tylko linie w g/ml i nie rusza soli ani sztuk', () => {
    const before = analyzeRecipe(dish, db, 2).perServing!
    const r = adaptRecipe(dish, 2, db, target, { mode: 'macros' })
    const dist = (n: number[]) =>
      Math.hypot(
        (n[IDX.kcal] - target.kcal) / target.kcal,
        (n[IDX.protein] - target.protein) / target.protein,
        (n[IDX.fat] - target.fat) / target.fat,
        (n[IDX.carbs] - target.carbs) / target.carbs,
      )
    expect(dist(r.after)).toBeLessThan(dist(before))
    expect(r.ingredients[5].text).toBe(dish[5].text) // sól
    expect(r.ingredients[6].text).toBe(dish[6].text) // ząbki czosnku (sztuki)
    for (const c of r.changes) expect(c.to).toMatch(/^[\d,]+ (g|ml|kg|l) /)
  })

  it('cel „więcej białka” daje większy udział białka niż zbilansowany', () => {
    const balanced = adaptRecipe(dish, 2, db, mealTarget({ ...DEFAULT_PREFS }), { mode: 'macros' })
    const protein = adaptRecipe(dish, 2, db, mealTarget({ ...DEFAULT_PREFS, ...PRESETS.highprotein, preset: 'highprotein' }), { mode: 'macros' })
    expect(protein.after[IDX.protein] / protein.after[IDX.kcal]).toBeGreaterThan(balanced.after[IDX.protein] / balanced.after[IDX.kcal])
  })

  it('opcja „mniej soli” obniża sód', () => {
    const salty = lines('200 g makaronu', '100 ml sosu sojowego', '150 g piersi z kurczaka')
    const plain = adaptRecipe(salty, 2, db, target, { mode: 'macros' })
    const low = adaptRecipe(salty, 2, db, target, { mode: 'macros', lowSalt: true })
    expect(low.after[IDX.sodium]).toBeLessThan(plain.after[IDX.sodium])
  })

  it('bez składników z bazy zwraca problem zamiast zgadywać', () => {
    const r = adaptRecipe(lines('1 l żuru'), 2, db, target, { mode: 'macros' })
    expect(r.problem).toBeTruthy()
    expect(r.changes).toEqual([])
    expect(isReached(r.after, target)).toBe(false)
  })

  it('przepis bez pozycji do sterowania (same sztuki) zgłasza problem w trybie makro', () => {
    const r = adaptRecipe(lines('2 jajka', '1 banan'), 1, db, target, { mode: 'macros' })
    expect(r.problem).toMatch(/g lub ml/)
  })
})

describe('preferencje', () => {
  it('naprawiają wartości spoza zakresu i sumę makro', () => {
    const p = sanitize({ kcalPerDay: 99999, mealsPerDay: 0, preset: 'custom', protein: 50, fat: 50, carbs: 50 })
    expect(p.kcalPerDay).toBe(6000)
    expect(p.mealsPerDay).toBe(1)
    expect(p.protein + p.fat + p.carbs).toBe(100)
  })

  it('gotowy zestaw ustawia proporcje, nieznany wraca do zbilansowanego', () => {
    expect(sanitize({ preset: 'highprotein' })).toMatchObject({ protein: 30, fat: 30, carbs: 40 })
    expect(sanitize({ preset: 'nie-ma' as never })).toMatchObject({ preset: 'balanced' })
    expect(sanitize(null)).toEqual(DEFAULT_PREFS)
  })
})

describe('produkty wskazane ręcznie w formularzu', () => {
  it('food_id przechodzi z przepisu do formularza i z powrotem, także po normalizacji linii', async () => {
    const { draftToForm, formToDraft } = await import('../src/lib/recipeForm')
    const draft = {
      title: 'T',
      ingredients: [{ text: '150 g mąka pszenna', food_id: 168894 }, { text: '2 jajka' }],
      steps: [],
      tags: [],
      parse_method: 'manual' as const,
    }
    const form = draftToForm(draft)
    expect(form.foodIds).toEqual({ '150 g mąka pszenna': 168894 })
    const back = formToDraft({ ...form, ingredients: `${form.ingredients}\nMleko – 1 szklanka`, foodIds: { ...form.foodIds, 'Mleko – 1 szklanka': 171265 } })
    expect(back.ingredients[0]).toEqual({ text: '150 g mąka pszenna', food_id: 168894 })
    expect(back.ingredients[1]).toEqual({ text: '2 jajka' })
    expect(back.ingredients[2]).toEqual({ text: '250 ml mleko', food_id: 171265 }) // klucz po surowym tekście, zapis po normalizacji
  })
})

describe('dokładniejsze wyszukiwanie', () => {
  it('odmiany makaronu trafiają w „Makaron, suchy” (synonimy)', () => {
    const r = db.search('suchy makaron spaghetti', { limit: 5 })
    expect(r.length).toBeGreaterThan(0)
    expect(r[0].name).toMatch(/^Makaron/)
    expect(db.search('penne', { limit: 3 })[0]).toBeDefined()
  })

  it('żółtko ma własną wagę, a nie wagę całego jajka', () => {
    const yolk = analyzeLine({ text: '1 żółtko jajka' }, db)
    expect(yolk.food?.name).toMatch(/żółtko/)
    expect(yolk.grams).toBeGreaterThan(10)
    expect(yolk.grams).toBeLessThan(25)
    expect(analyzeLine({ text: '2 żółtka' }, db).grams).toBeCloseTo(2 * yolk.grams!, 5)
    expect(analyzeLine({ text: '1 jajko' }, db).grams).toBe(55)
  })

  it('hideJunk usuwa produkty dla niemowląt, markowe i z restauracji', () => {
    const all = db.search('mleko', { limit: 60 })
    const clean = db.search('mleko', { limit: 60, hideJunk: true })
    expect(all.some((f) => f.catEn === 'Baby Foods')).toBe(true)
    expect(clean.some((f) => f.catEn === 'Baby Foods')).toBe(false)
    expect(clean.length).toBeGreaterThan(5)
  })
})

describe('produkty z opakowań (Open Food Facts)', () => {
  const usda = JSON.parse(readFileSync('src/data/foods.json', 'utf8')) as FoodData
  const off = {
    v: 1,
    products: [
      [5900000000001, 'Makaron spaghetti', 'Lubella', [350, 12, 1.5, 72, 3, 3, 0.3, 6, 0, ...new Array(15).fill(0)]],
      [5900000000002, 'Jogurt naturalny', 'Bakoma', [63, 4.3, 3.2, 4.8, 4.8, 0, 2, 50, 0, ...new Array(15).fill(0)]],
    ] as [number, string, string, number[]][],
  }
  const both = buildFoodDb(usda, off)

  it('dokłada produkty do bazy i pozwala szukać po marce', () => {
    expect(both.size).toBe(usda.foods.length + 2)
    const r = both.search('lubella spaghetti', { limit: 5 })
    expect(r[0]).toMatchObject({ source: 'off', brand: 'Lubella', id: 5900000000001 })
    expect(both.byId.get(5900000000002)?.name).toBe('Jogurt naturalny')
  })

  it('zwykłe wyszukiwanie nadal stawia ogólny składnik przed produktem z opakowania', () => {
    expect(both.search('makaron', { limit: 5 })[0].source).toBe('usda')
  })

  it('automatyczne dopasowanie składnika z przepisu nie sięga po produkty z opakowań', () => {
    expect(both.match('makaron spaghetti')?.source).toBe('usda')
    expect(both.match('jogurt naturalny')?.source).toBe('usda')
  })

  it('produkt z opakowania można wskazać ręcznie (food_id) i liczy się z jego wartości', () => {
    const a = analyzeLine({ text: '200 g makaron spaghetti', food_id: 5900000000001 }, both)
    expect(a.manual).toBe(true)
    expect(a.nutrients![IDX.kcal]).toBeCloseTo(700, 5)
  })

  it('krótka nazwa produktu z opakowania to jego pełna nazwa', () => {
    expect(shortName(both.byId.get(5900000000001)!)).toBe('makaron spaghetti')
  })
})

describe('dane Open Food Facts w repozytorium', () => {
  const off = JSON.parse(readFileSync('src/data/off-products.json', 'utf8')) as { products: [number, string, string, number[]][] }
  const usda = JSON.parse(readFileSync('src/data/foods.json', 'utf8')) as FoodData
  const all = buildFoodDb(usda, off as never)

  it('ma ponad 10 tysięcy polskich produktów z poprawnymi wartościami i unikalnymi kodami', () => {
    expect(off.products.length).toBeGreaterThan(10000)
    expect(new Set(off.products.map((p) => p[0])).size).toBe(off.products.length)
    expect(off.products.every(([code, name, , n]) => Number.isSafeInteger(code) && name.length >= 3 && n.length === 24 && n.every(Number.isFinite))).toBe(true)
    // kody OFF nie mogą się zderzać z identyfikatorami USDA (food_id jest wspólny)
    const usdaIds = new Set(usda.foods.map((f) => f[0]))
    expect(off.products.some(([code]) => usdaIds.has(code))).toBe(false)
  })

  it('wyszukiwanie znajduje polskie produkty z opakowań (spaghetti, jajka, mąka)', () => {
    for (const q of ['spaghetti', 'jajka', 'mąka tortowa']) {
      const r = all.search(q, { limit: 60 })
      expect(r.some((f) => f.source === 'off'), q).toBe(true)
    }
  })

  it('składnik z przepisu nadal dopasowuje się do ogólnych składników', () => {
    expect(all.match('mąki pszennej')?.source).toBe('usda')
    expect(analyzeLine({ text: '2 jajka' }, all).food?.source).toBe('usda')
  })
})
