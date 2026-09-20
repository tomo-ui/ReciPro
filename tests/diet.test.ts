import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildFoodDb, type FoodData, type FoodDb } from '../src/lib/foodDb'
import { IDX } from '../src/lib/nutrients'
import { DEFAULT_PREFS } from '../src/lib/prefs'
import {
  analyzeDiet,
  copyDiet,
  dayTargetOf,
  itemFromFood,
  itemFromRecipe,
  itemNutrients,
  mealLayout,
  mealTargetOf,
  newDiet,
  normalizeShares,
  sanitizeDiet,
  withLineAmount,
  withMacros,
  withPortions,
} from '../src/lib/diet'
import type { Diet } from '../src/types/diet'

let db: FoodDb
beforeAll(() => {
  db = buildFoodDb(JSON.parse(readFileSync('src/data/foods.json', 'utf8')) as FoodData)
})

const recipe = {
  id: 'r1',
  title: 'Makaron z kurczakiem',
  image_url: 'https://x/a.jpg',
  servings: 2,
  ingredients: [{ text: '200 g makaronu' }, { text: '300 g piersi z kurczaka' }, { text: '30 ml oliwy z oliwek' }],
}

describe('rozpisanie na posiłki', () => {
  it('nazwy i udziały kalorii dla wybranej liczby posiłków sumują się do 100', () => {
    for (let n = 1; n <= 8; n++) {
      const l = mealLayout(n)
      expect(l).toHaveLength(n)
      expect(l.reduce((a, m) => a + m.share, 0)).toBe(100)
    }
    expect(mealLayout(4).map((m) => m.name)).toEqual(['Śniadanie', 'Obiad', 'Podwieczorek', 'Kolacja'])
    expect(mealLayout(7)[6].name).toBe('Posiłek 7')
    expect(mealLayout(99)).toHaveLength(8)
  })

  it('normalizacja udziałów po zmianach: suma 100, każdy co najmniej 1', () => {
    const meals = normalizeShares(newDiet('x', 3).meals.map((m, i) => ({ ...m, share: [50, 50, 0][i] })))
    expect(meals.reduce((a, m) => a + m.share, 0)).toBe(100)
    expect(meals.every((m) => m.share >= 1)).toBe(true)
    expect(normalizeShares([])).toEqual([])
  })

  it('nowa dieta ma cele z ustawień i puste posiłki', () => {
    const d = newDiet('  Redukcja  ', 5, { ...DEFAULT_PREFS, kcalPerDay: 1800 })
    expect(d.title).toBe('Redukcja')
    expect(d.targets).toMatchObject({ kcalPerDay: 1800, protein: 20, fat: 30, carbs: 50 })
    expect(d.meals).toHaveLength(5)
    expect(d.meals.every((m) => m.items.length === 0)).toBe(true)
    expect(newDiet('', 3).title).toBe('Nowa dieta')
  })
})

describe('cele', () => {
  const targets = newDiet('x', 4).targets

  it('cel posiłku wynika z udziału kalorii i proporcji makro', () => {
    const t = mealTargetOf(targets, 25)
    expect(t.kcal).toBe(500)
    expect(t.protein).toBeCloseTo(25, 5)
    expect(t.fat).toBeCloseTo((500 * 0.3) / 9, 5)
    expect(dayTargetOf(targets).kcal).toBe(2000)
  })

  it('własne makro: białko i tłuszcz zmieniają się, węglowodany to reszta do 100%', () => {
    const t = withMacros(targets, { protein: 30 })
    expect(t).toMatchObject({ preset: 'custom', protein: 30, fat: 30, carbs: 40 })
    const extreme = withMacros(targets, { protein: 70, fat: 70 })
    expect(extreme.protein + extreme.fat + extreme.carbs).toBe(100)
    expect(extreme.carbs).toBeGreaterThanOrEqual(5)
    expect(withMacros(t, { preset: 'lowcarb' })).toMatchObject({ preset: 'lowcarb', protein: 25, fat: 45, carbs: 30 })
  })
})

describe('dania w diecie', () => {
  it('danie z przepisu ma składniki jednej porcji', () => {
    const item = itemFromRecipe(recipe)
    expect(item).toMatchObject({ title: 'Makaron z kurczakiem', recipe_id: 'r1', portions: 1, image_url: 'https://x/a.jpg' })
    expect(item.lines.map((l) => l.text)).toEqual(['100 g makaronu', '150 g piersi z kurczaka', '15 ml oliwy z oliwek'])
    // kalorie jednej porcji = połowa kalorii całego przepisu
    const whole = itemNutrients({ ...item, lines: recipe.ingredients, portions: 1 }, db)[IDX.kcal]
    expect(itemNutrients(item, db)[IDX.kcal]).toBeCloseTo(whole / 2, 3)
  })

  it('przepis bez liczby porcji liczy się jako jedna porcja', () => {
    const item = itemFromRecipe({ ...recipe, servings: undefined })
    expect(item.lines[0].text).toBe('200 g makaronu')
  })

  it('produkt z bazy jako danie z zapamiętanym food_id', () => {
    const egg = db.find('Egg, whole, raw, fresh')!
    const item = itemFromFood(egg, 120)
    expect(item.lines).toEqual([{ text: '120 g jajko', food_id: egg.id }])
    expect(itemNutrients(item, db)[IDX.kcal]).toBeCloseTo(egg.n[IDX.kcal] * 1.2, 3)
  })

  it('porcje: krok 0,25, zakres 0,25–20; kalorie rosną proporcjonalnie', () => {
    const item = itemFromRecipe(recipe)
    expect(withPortions(item, 1.4).portions).toBe(1.5)
    expect(withPortions(item, 0).portions).toBe(0.25)
    expect(withPortions(item, 99).portions).toBe(20)
    expect(itemNutrients(withPortions(item, 2), db)[IDX.kcal]).toBeCloseTo(itemNutrients(item, db)[IDX.kcal] * 2, 3)
  })

  it('zmiana gramatury składnika dotyka tylko wybranej linii', () => {
    const item = itemFromRecipe(recipe)
    const changed = withLineAmount(item, 1, 200)
    expect(changed.lines.map((l) => l.text)).toEqual(['100 g makaronu', '200 g piersi z kurczaka', '15 ml oliwy z oliwek'])
    expect(item.lines[1].text).toBe('150 g piersi z kurczaka') // oryginał bez zmian
  })
})

describe('analiza diety', () => {
  it('sumuje dania w posiłkach i posiłki w dniu', () => {
    const d = newDiet('Test', 2)
    d.meals[0].items.push(itemFromRecipe(recipe))
    d.meals[1].items.push(withPortions(itemFromRecipe(recipe), 2), itemFromFood(db.find('Butter, salted')!, 10))
    const a = analyzeDiet(d, db)
    const one = itemNutrients(d.meals[0].items[0], db)[IDX.kcal]
    expect(a.meals[0].total[IDX.kcal]).toBeCloseTo(one, 3)
    expect(a.meals[1].total[IDX.kcal]).toBeGreaterThan(one * 2)
    expect(a.day[IDX.kcal]).toBeCloseTo(a.meals[0].total[IDX.kcal] + a.meals[1].total[IDX.kcal], 3)
    expect(analyzeDiet(newDiet('Pusta', 3), db).day.every((v) => v === 0)).toBe(true)
  })
})

describe('kopia diety od innej osoby', () => {
  const original: Diet = {
    id: 'd1',
    user_id: 'u-anna',
    title: 'Dieta 2000',
    description: 'Opis',
    meals: newDiet('x', 2).meals.map((m, i) => ({ ...m, items: i === 0 ? [itemFromRecipe(recipe)] : [] })),
    targets: newDiet('x', 2).targets,
    is_public: true,
    created_at: 'a',
    updated_at: 'b',
    author: { username: 'anna_gotuje' },
  }

  it('ma nowe identyfikatory, jest prywatna i wskazuje autora', () => {
    const c = copyDiet(original)
    expect(c.is_public).toBe(false)
    expect(c.source).toEqual({ diet_id: 'd1', user_id: 'u-anna', username: 'anna_gotuje', title: 'Dieta 2000' })
    expect(c.meals[0].id).not.toBe(original.meals[0].id)
    expect(c.meals[0].items[0].id).not.toBe(original.meals[0].items[0].id)
    expect(c.meals[0].items[0].lines).toEqual(original.meals[0].items[0].lines)
  })

  it('zmiany w kopii nie ruszają oryginału', () => {
    const c = copyDiet(original)
    c.meals[0].items[0].lines[0].text = '999 g czegoś'
    c.targets.kcalPerDay = 1500
    expect(original.meals[0].items[0].lines[0].text).toBe('100 g makaronu')
    expect(original.targets.kcalPerDay).toBe(2000)
  })

  it('kopia kopii wskazuje pierwotnego autora', () => {
    const first = copyDiet(original)
    const second = copyDiet({ ...original, id: 'd2', user_id: 'u-bartek', author: { username: 'bartek' }, source: first.source })
    expect(second.source?.username).toBe('anna_gotuje')
  })
})

describe('naprawa danych z bazy', () => {
  it('uzupełnia brakujące cele, porcje i identyfikatory oraz normalizuje udziały', () => {
    const d = sanitizeDiet({
      meals: [{ id: '', name: '', share: 10, items: [{ id: '', title: 'x', lines: undefined as never, portions: 0 }] }, { id: 'm2', name: 'Obiad', share: 10, items: [] }],
      targets: { kcalPerDay: 1700 } as never,
    })
    expect(d.targets).toMatchObject({ kcalPerDay: 1700, protein: 20, fat: 30, carbs: 50 })
    expect(d.meals[0].id).toBeTruthy()
    expect(d.meals[0].name).toBe('Posiłek')
    expect(d.meals[0].items[0]).toMatchObject({ portions: 1, lines: [] })
    expect(d.meals.reduce((a, m) => a + m.share, 0)).toBe(100)
    expect(sanitizeDiet({ meals: 'zepsute' as never, targets: undefined as never }).meals).toEqual([])
  })
})

describe('formatowanie liczb w podsumowaniu', () => {
  it('zero to „0”, małe wartości mają miejsca po przecinku, duże są całkowite', async () => {
    const { formatAmount } = await import('../src/lib/nutrients')
    expect(formatAmount(0)).toBe('0')
    expect(formatAmount(0.456)).toBe('0,46')
    expect(formatAmount(7.25)).toBe('7,3')
    expect(formatAmount(1234.5)).toBe('1235')
  })
})
