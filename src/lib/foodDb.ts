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
  /** usda = ogólny składnik (USDA), off = produkt z opakowania (Open Food Facts) */
  source: 'usda' | 'off'
  /** Marka (tylko produkty z Open Food Facts) */
  brand?: string
}

/** Polskie produkty z Open Food Facts (ODbL): [kod kreskowy, nazwa, marka, wartości na 100 g] */
export interface OffData {
  v: number
  products: [number, string, string, number[]][]
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

export const OFF_CATEGORY = 'Produkty z opakowań (Open Food Facts)'
const OFF_CATEGORY_EN = 'Open Food Facts'

const CAT_PENALTY: Record<string, number> = {
  // Produkt z opakowania wygrywa z ogólnym składnikiem dopiero, gdy pasuje lepiej (marka, dokładna nazwa)
  [OFF_CATEGORY_EN]: 0.9,
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

/** Kategorie, które przy składaniu przepisu zwykle tylko przeszkadzają: markowe, restauracyjne, dla niemowląt */
const JUNK_CATEGORIES = new Set([
  'Baby Foods',
  'Fast Foods',
  'Restaurant Foods',
  'Branded Food Products Database',
  'American Indian/Alaska Native Foods',
  'Quality Control Materials',
])

/** Odmiany makaronu i inne słowa, które w bazie kryją się pod ogólną nazwą („Makaron, suchy”) */
const SYNONYMS = new Map<string, string[]>()
for (const w of ['spaghetti', 'penne', 'fusilli', 'tagliatelle', 'farfalle', 'rigatoni', 'lasagne', 'nudle', 'muszelki', 'kokardki', 'swiderki', 'rurki', 'wstazki']) {
  SYNONYMS.set(stem(w), [stem('makaron')])
}
/** Każde słowo zapytania może się znaleźć w nazwie także jako jeden ze swoich synonimów */
const withSynonyms = (stems: string[]): string[][] => stems.map((s) => [s, ...(SYNONYMS.get(s) ?? [])])

export interface SearchOptions {
  limit?: number
  /** Pomija produkty markowe, z restauracji, dla niemowląt itp. */
  hideJunk?: boolean
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

const pad = (n: number[]) => (n.length === NUTRIENT_COUNT ? n : [...n, ...new Array(Math.max(0, NUTRIENT_COUNT - n.length)).fill(0)])

export function buildFoodDb(data: FoodData, off?: OffData): FoodDb {
  const foods: Food[] = data.foods.map(([id, name, en, cat, n, p]) => ({
    id,
    name,
    en,
    cat: data.cats[cat] ?? '',
    catEn: data.catsEn?.[cat] ?? '',
    n: pad(n),
    p: p || {},
    source: 'usda' as const,
  }))
  for (const [id, name, brand, n] of off?.products ?? []) {
    foods.push({ id, name, en: '', cat: OFF_CATEGORY, catEn: OFF_CATEGORY_EN, n: pad(n), p: {}, source: 'off', brand: brand || undefined })
  }
  const byId = new Map(foods.map((f) => [f.id, f]))
  const byEn = new Map(foods.map((f) => [f.en, f]))
  const findEn = (en: string): Food | undefined =>
    byEn.get(en) ?? foods.find((f) => f.en.startsWith(`${en} (`)) ?? foods.find((f) => f.en.startsWith(en))

  /** Wzorce sprawdzamy od początku nazwy, a potem od kolejnych słów („biała kiełbasa” → „kiełbasa”) */
  const aliasFor = (name: string, startOnly = false): Food | undefined => {
    const words = cleanedName(name).split(' ').filter(Boolean)
    for (let i = 0; i < Math.min(words.length, startOnly ? 1 : 3); i++) {
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
    if (f.brand) for (const t of tokens(f.brand)) add(t, idx, 1.4)
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

  function rank(qs: string[][], minRatio: number, limit: number, hideJunk = false, genericOnly = false): Food[] {
    if (qs.length === 0) return []
    const need = Math.max(1, Math.ceil(qs.length * minRatio - 1e-9))
    const best = new Map<number, number[]>() // produkt → najlepsza waga dla każdego słowa zapytania
    qs.forEach((alts, qi) => {
      for (const q of alts) {
        for (const [key, factor] of expand(q)) {
          for (const [idx, w] of postings.get(key)!) {
            let arr = best.get(idx)
            if (!arr) best.set(idx, (arr = new Array(qs.length).fill(0)))
            arr[qi] = Math.max(arr[qi], w * factor)
          }
        }
      }
    })
    const flat = qs.flat()
    const scored: [number, Food][] = []
    for (const [idx, arr] of best) {
      const matched = arr.filter((v) => v > 0).length
      if (matched < need) continue
      const f = foods[idx]
      if (hideJunk && JUNK_CATEGORIES.has(f.catEn)) continue
      if (genericOnly && f.source === 'off') continue
      const extra = Math.max(0, tokenCount[idx] - matched)
      const score =
        arr.reduce((a, b) => a + b, 0) -
        0.12 * extra -
        (CAT_PENALTY[f.catEn] ?? 0) -
        0.004 * f.name.length +
        (isRaw(f) ? 0.45 : 0) +
        (flat.some((q) => firstToken[idx] === q || (q.length >= 4 && firstToken[idx].startsWith(q)) || (firstToken[idx].length >= 4 && q.startsWith(firstToken[idx]))) ? 1.2 : 0)
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
      const key = `${query}|${opts.minRatio ?? 1}|${limit}|${opts.hideJunk ? 1 : 0}`
      const hit = cache.get(key)
      if (hit) return hit
      let res = rank(withSynonyms([...new Set(tokens(query))]), opts.minRatio ?? 1, limit, opts.hideJunk)
      // Popularny składnik (np. „mąka pszenna”) na pierwszym miejscu: to zwykle ten, o który chodzi
      const preferred = aliasFor(query, true) // tylko gdy zapytanie zaczyna się od tego składnika (nie „marka + składnik”)
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
      const top = rank(withSynonyms(qs), qs.length > 1 ? 0.5 : 1, 1, false, true)[0]
      return top
    },
  }
}

/** Krótka nazwa do wstawienia w linię przepisu: „ser mozzarella”, „mleko pełne” */
export function shortName(food: Food): string {
  const clauses = food.name.split(',').map((c) => c.trim()).filter(Boolean)
  const skip = /^(surow|śwież|swiez|ugotowan|gotowan|bez |z |o |cały|cała|całe)/i
  let name = clauses[0] ?? food.name
  if (food.source === 'off') return name.charAt(0).toLowerCase() + name.slice(1) // nazwa z opakowania w całości
  if (clauses[1] && clauses[1].split(/\s+/).length <= 3 && !skip.test(clauses[1])) name += ` ${clauses[1]}`
  return name.charAt(0).toLowerCase() + name.slice(1)
}

let dbPromise: Promise<FoodDb> | undefined

/** Wczytuje bazę raz na sesję (osobny fragment aplikacji) */
export function loadFoodDb(): Promise<FoodDb> {
  dbPromise ??= Promise.all([
    import('@/data/foods.json'),
    // produkty z opakowań są dodatkiem: bez nich baza działa dalej
    import('@/data/off-products.json').catch(() => null),
  ]).then(([usda, off]) => buildFoodDb((usda.default ?? usda) as unknown as FoodData, off ? ((off.default ?? off) as unknown as OffData) : undefined))
  return dbPromise
}
