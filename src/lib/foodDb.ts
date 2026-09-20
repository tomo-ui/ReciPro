import { fold } from './text'
import { ALIASES } from './foodAliases'
import { NUTRIENT_COUNT } from './nutrients'

/**
 * Baza składników (USDA SR Legacy, ~7,8 tys. produktów) i wyszukiwanie po polsku: wszystko lokalnie,
 * bez zapytań do sieci. Dane leżą w src/data/foods.json i są doładowywane dopiero wtedy, gdy są potrzebne
 * (osobny fragment aplikacji), a Service Worker trzyma je w pamięci podręcznej.
 */

export type PortionKey = 'c' | 't' | 's' | 'pc' | 'sl' | 'cl' | 'cn'
/** Gramy na jedną miarę: c=szklanka, t=łyżka, s=łyżeczka, pc=sztuka, sl=plasterek, cl=ząbek, cn=puszka */
export type Portions = Partial<Record<PortionKey, number>>

export interface Food {
  id: number
  /** Polska nazwa, np. "Ser, mozzarella, o niskiej zawartości sodu" */
  name: string
  en: string
  cat: string
  catEn: string
  /** Wartości na 100 g w kolejności z nutrients.ts */
  n: number[]
  p: Portions
}

export interface FoodData {
  v: number
  cats: string[]
  catsEn: string[]
  foods: [number, string, string, number, number[], Portions | 0][]
}

const STOP = new Set(['z', 'ze', 'do', 'na', 'i', 'w', 'bez', 'o', 'po', 'od', 'the', 'of', 'and', 'or', 'with'])
const ENDINGS = ['owego', 'iego', 'ymi', 'imi', 'ami', 'ach', 'ego', 'emu', 'owi', 'ych', 'ich', 'iej', 'ej', 'ym', 'im', 'om', 'ow', 'ie', 'ia', 'ii', 'a', 'e', 'i', 'y', 'u', 'o']

/** Zgrubny rdzeń polskiego słowa (mąki, mąka, mąkę → "mak"); słowa krótkie zostają bez zmian */
export function stem(word: string): string {
  const w = fold(word)
  if (w.length <= 3) return w
  for (const end of ENDINGS) {
    if (w.length - end.length >= 3 && w.endsWith(end)) return w.slice(0, -end.length)
  }
  return w
}

const WORD = /[a-z0-9]+/g
export function tokens(text: string): string[] {
  return (fold(text).match(WORD) ?? []).filter((w) => !STOP.has(w)).map(stem)
}

/** Słowa opisowe w nazwach składników w przepisach, które nie pomagają w dopasowaniu */
const NOISE = new Set([
  'swiezy', 'swieza', 'swieze', 'swiezo', 'posiekany', 'posiekana', 'posiekane', 'pokrojony', 'pokrojona', 'pokrojone', 'starty', 'starta', 'starte',
  'drobno', 'grubo', 'duzy', 'duza', 'duze', 'maly', 'mala', 'male', 'sredni', 'srednia', 'srednie', 'smaku', 'opcjonalnie', 'ewentualnie',
  'okolo', 'wedlug', 'uznania', 'lekko', 'gladki', 'gladka', 'gotowy', 'gotowa', 'gotowe', 'najlepiej', 'ok', 'szt', 'porcja', 'porcje',
  'plaster', 'plastry', 'plasterki', 'plasterek', 'zabek', 'zabki', 'zabkow', 'garsc', 'szczypta', 'sztuka', 'sztuki', 'sztuk', 'peczek', 'peczki',
  'puszka', 'puszki', 'puszek', 'opakowanie', 'opakowania', 'kostka', 'kostki', 'lyzka', 'lyzki', 'lyzek', 'lyzeczka', 'lyzeczki', 'lyzeczek', 'szklanka', 'szklanki', 'szklanek',
])

export function ingredientQueryTokens(name: string): string[] {
  const head = name.replace(/\([^)]*\)/g, ' ').split(/[,;:]/)[0]
  const out = (fold(head).match(WORD) ?? []).filter((w) => !STOP.has(w) && !NOISE.has(w) && !/^\d+$/.test(w)).map(stem)
  return [...new Set(out)]
}

const CAT_PENALTY: Record<string, number> = {
  'Baby Foods': 1.6,
  'Fast Foods': 1.1,
  'Restaurant Foods': 1.3,
  'Branded Food Products Database': 1.3,
  'American Indian/Alaska Native Foods': 1.4,
  'Meals, Entrees, and Side Dishes': 0.6,
  Snacks: 0.3,
  'Quality Control Materials': 3,
}

const CLAUSE_WEIGHT = [3, 2.4, 1.3]
const isRaw = (f: Food) => /surow|^raw|, raw/i.test(f.name) || /(^|, )raw($|,)/.test(f.en)

export interface SearchOptions {
  limit?: number
  /** Jaka część słów zapytania musi się znaleźć w nazwie (1 = wszystkie) */
  minRatio?: number
}

export interface FoodDb {
  foods: Food[]
  byId: Map<number, Food>
  search(query: string, opts?: SearchOptions): Food[]
  /** Najlepszy produkt dla nazwy składnika z przepisu (z obsługą ustalonych aliasów) */
  match(ingredientName: string): Food | undefined
  /** Produkt po opisie USDA (dokładnym albo jego początku) */
  find(en: string): Food | undefined
  size: number
}

/** Nazwa składnika bez ogonków, ilości i słów opisowych — do porównania ze wzorcami aliasów */
export function cleanedName(name: string): string {
  const head = name.replace(/\([^)]*\)/g, ' ').split(/[,;:]/)[0]
  return (fold(head).match(WORD) ?? []).filter((w) => !NOISE.has(w)).join(' ')
}

export function buildFoodDb(data: FoodData): FoodDb {
  const foods: Food[] = data.foods.map(([id, name, en, cat, n, p]) => ({
    id,
    name,
    en,
    cat: data.cats[cat] ?? '',
    catEn: data.catsEn?.[cat] ?? '',
    n: n.length === NUTRIENT_COUNT ? n : [...n, ...new Array(Math.max(0, NUTRIENT_COUNT - n.length)).fill(0)],
    p: p || {},
  }))
  const byId = new Map(foods.map((f) => [f.id, f]))
  const byEn = new Map(foods.map((f) => [f.en, f]))
  const findEn = (en: string): Food | undefined =>
    byEn.get(en) ?? foods.find((f) => f.en.startsWith(`${en} (`)) ?? foods.find((f) => f.en.startsWith(en))

  /** Wzorce sprawdzamy od początku nazwy, a potem od kolejnych słów („biała kiełbasa” → „kiełbasa”) */
  const aliasFor = (name: string): Food | undefined => {
    const words = cleanedName(name).split(' ').filter(Boolean)
    for (let i = 0; i < Math.min(words.length, 3); i++) {
      const rest = words.slice(i).join(' ')
      for (const [re, en] of ALIASES) {
        if (re.test(rest)) {
          const f = findEn(en)
          if (f) return f
        }
      }
    }
    return undefined
  }

  // indeks: rdzeń słowa → [(produkt, waga)] oraz liczba słów nazwy
  const postings = new Map<string, [number, number][]>()
  const tokenCount: number[] = []
  const firstToken: string[] = [] // rzeczownik główny: pierwsze słowo nazwy
  const add = (stemmed: string, idx: number, weight: number) => {
    let list = postings.get(stemmed)
    if (!list) postings.set(stemmed, (list = []))
    if (!list.some((e) => e[0] === idx)) list.push([idx, weight])
  }
  foods.forEach((f, idx) => {
    let count = 0
    f.name.split(',').forEach((clause, ci) => {
      const toks = tokens(clause)
      count += toks.length
      for (const t of toks) add(t, idx, CLAUSE_WEIGHT[Math.min(ci, CLAUSE_WEIGHT.length - 1)])
    })
    tokenCount.push(count)
    firstToken.push(tokens(f.name)[0] ?? '')
    for (const t of tokens(f.en)) add(t, idx, 0.9) // angielskie słowa też działają, ale słabiej
  })
  const vocab = [...postings.keys()]

  const expand = (q: string): [string, number][] => {
    const out: [string, number][] = []
    for (const key of vocab) {
      if (key === q) out.push([key, 1])
      else if (q.length >= 4 && key.startsWith(q) && key.length - q.length <= 2) out.push([key, 0.8])
      else if (key.length >= 4 && q.startsWith(key) && q.length - key.length <= 2) out.push([key, 0.85])
    }
    return out
  }

  const cache = new Map<string, Food[]>()

  function rank(qs: string[], minRatio: number, limit: number): Food[] {
    if (qs.length === 0) return []
    const need = Math.max(1, Math.ceil(qs.length * minRatio - 1e-9))
    const best = new Map<number, number[]>() // produkt → najlepsza waga dla każdego słowa zapytania
    qs.forEach((q, qi) => {
      for (const [key, factor] of expand(q)) {
        for (const [idx, w] of postings.get(key)!) {
          let arr = best.get(idx)
          if (!arr) best.set(idx, (arr = new Array(qs.length).fill(0)))
          arr[qi] = Math.max(arr[qi], w * factor)
        }
      }
    })
    const scored: [number, Food][] = []
    for (const [idx, arr] of best) {
      const matched = arr.filter((v) => v > 0).length
      if (matched < need) continue
      const f = foods[idx]
      const extra = Math.max(0, tokenCount[idx] - matched)
      const score =
        arr.reduce((a, b) => a + b, 0) -
        0.12 * extra -
        (CAT_PENALTY[f.catEn] ?? 0) -
        0.004 * f.name.length +
        (isRaw(f) ? 0.45 : 0) +
        (qs.some((q) => firstToken[idx] === q || (q.length >= 4 && firstToken[idx].startsWith(q)) || (firstToken[idx].length >= 4 && q.startsWith(firstToken[idx]))) ? 1.2 : 0)
      scored.push([score, f])
    }
    scored.sort((a, b) => b[0] - a[0] || a[1].name.length - b[1].name.length)
    return scored.slice(0, limit).map((s) => s[1])
  }

  return {
    foods,
    byId,
    size: foods.length,
    search(query, opts = {}) {
      const limit = opts.limit ?? 30
      const key = `${query}|${opts.minRatio ?? 1}|${limit}`
      const hit = cache.get(key)
      if (hit) return hit
      let res = rank([...new Set(tokens(query))], opts.minRatio ?? 1, limit)
      // Popularny składnik (np. „mąka pszenna”) na pierwszym miejscu: to zwykle ten, o który chodzi
      const preferred = aliasFor(query)
      if (preferred && res.length > 0) res = [preferred, ...res.filter((f) => f.id !== preferred.id)].slice(0, limit)
      if (cache.size > 500) cache.clear()
      cache.set(key, res)
      return res
    },
    find: findEn,
    match(name) {
      const aliased = aliasFor(name)
      if (aliased) return aliased
      const qs = ingredientQueryTokens(name)
      const top = rank(qs, qs.length > 1 ? 0.5 : 1, 1)[0]
      return top
    },
  }
}

/** Krótka nazwa do wstawienia w linię przepisu: „ser mozzarella”, „mleko pełne” */
export function shortName(food: Food): string {
  const clauses = food.name.split(',').map((c) => c.trim()).filter(Boolean)
  const skip = /^(surow|śwież|swiez|ugotowan|gotowan|bez |z |o |cały|cała|całe)/i
  let name = clauses[0] ?? food.name
  if (clauses[1] && clauses[1].split(/\s+/).length <= 3 && !skip.test(clauses[1])) name += ` ${clauses[1]}`
  return name.charAt(0).toLowerCase() + name.slice(1)
}

let dbPromise: Promise<FoodDb> | undefined

/** Wczytuje bazę raz na sesję (osobny fragment aplikacji) */
export function loadFoodDb(): Promise<FoodDb> {
  dbPromise ??= import('@/data/foods.json').then((m) => buildFoodDb((m.default ?? m) as unknown as FoodData))
  return dbPromise
}
