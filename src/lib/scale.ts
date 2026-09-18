/**
 * Kalkulator porcji: przelicza ilość na początku linii składnika (albo po etykiecie „mąka – 200 g”)
 * proporcjonalnie do zmiany liczby porcji i poprawia polską odmianę:
 *   1 łyżka → 3 łyżki → 5 łyżek → 1½ łyżki,   1 duża cebula → 2 duże cebule → 5 dużych cebul.
 * Wagi i objętości przechodzą między jednostkami (1200 g → 1,2 kg, 0,5 kg → 500 g).
 * Rzeczy, których nie da się przeliczyć („szczypta soli”, „do smaku”), zostają bez zmian.
 */

const L = 'A-Za-zĄąĆćĘęŁłŃńÓóŚśŹźŻż' // litery, także polskie

const VULGAR: Record<string, number> = {
  '½': 1 / 2, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 1 / 4, '¾': 3 / 4, '⅕': 1 / 5, '⅖': 2 / 5, '⅗': 3 / 5,
  '⅘': 4 / 5, '⅙': 1 / 6, '⅚': 5 / 6, '⅛': 1 / 8, '⅜': 3 / 8, '⅝': 5 / 8, '⅞': 7 / 8,
}
const VF = Object.keys(VULGAR).join('')
const VULGAR_OUT: Record<number, string> = { 0.25: '¼', 0.5: '½', 0.75: '¾' }

/* — odmiana — */

type Gender = 'm' | 'f' | 'n'
/** [mianownik lp., mianownik lm. (2–4), dopełniacz lm. (5+), dopełniacz lp. (ułamki)] */
type Forms = [string, string, string, string]
interface Noun {
  forms: Forms
  gender: Gender
  lang: 'pl' | 'en'
  /** Jednostki objętościowe/miarowe pokazujemy w ćwiartkach: ¼, ½, 1¼… */
  fraction?: boolean
}

const PL_NOUNS: [Gender, boolean, Forms][] = [
  // miary (w ćwiartkach)
  ['f', true, ['łyżka', 'łyżki', 'łyżek', 'łyżki']],
  ['f', true, ['łyżeczka', 'łyżeczki', 'łyżeczek', 'łyżeczki']],
  ['f', true, ['szklanka', 'szklanki', 'szklanek', 'szklanki']],
  ['f', true, ['filiżanka', 'filiżanki', 'filiżanek', 'filiżanki']],
  ['m', true, ['kubek', 'kubki', 'kubków', 'kubka']],
  ['f', true, ['szczypta', 'szczypty', 'szczypt', 'szczypty']],
  ['f', true, ['garść', 'garście', 'garści', 'garści']],
  ['m', true, ['gram', 'gramy', 'gramów', 'grama']],
  ['m', true, ['kilogram', 'kilogramy', 'kilogramów', 'kilograma']],
  ['m', true, ['dekagram', 'dekagramy', 'dekagramów', 'dekagrama']],
  ['m', true, ['litr', 'litry', 'litrów', 'litra']],
  ['m', true, ['mililitr', 'mililitry', 'mililitrów', 'mililitra']],
  // opakowania i porcje
  ['f', false, ['kostka', 'kostki', 'kostek', 'kostki']],
  ['m', false, ['plaster', 'plastry', 'plastrów', 'plastra']],
  ['m', false, ['plasterek', 'plasterki', 'plasterków', 'plasterka']],
  ['f', false, ['sztuka', 'sztuki', 'sztuk', 'sztuki']],
  ['f', false, ['puszka', 'puszki', 'puszek', 'puszki']],
  ['n', false, ['opakowanie', 'opakowania', 'opakowań', 'opakowania']],
  ['f', false, ['kromka', 'kromki', 'kromek', 'kromki']],
  ['m', false, ['pęczek', 'pęczki', 'pęczków', 'pęczka']],
  ['f', false, ['główka', 'główki', 'główek', 'główki']],
  ['f', false, ['łodyga', 'łodygi', 'łodyg', 'łodygi']],
  ['f', false, ['gałązka', 'gałązki', 'gałązek', 'gałązki']],
  ['m', false, ['listek', 'listki', 'listków', 'listka']],
  ['m', false, ['liść', 'liście', 'liści', 'liścia']],
  ['m', false, ['kawałek', 'kawałki', 'kawałków', 'kawałka']],
  ['m', false, ['słoik', 'słoiki', 'słoików', 'słoika']],
  ['f', false, ['butelka', 'butelki', 'butelek', 'butelki']],
  ['f', false, ['saszetka', 'saszetki', 'saszetek', 'saszetki']],
  ['f', false, ['torebka', 'torebki', 'torebek', 'torebki']],
  ['f', false, ['kulka', 'kulki', 'kulek', 'kulki']],
  // produkty
  ['n', false, ['jajko', 'jajka', 'jajek', 'jajka']],
  ['n', false, ['żółtko', 'żółtka', 'żółtek', 'żółtka']],
  ['n', false, ['białko', 'białka', 'białek', 'białka']],
  ['f', false, ['cebula', 'cebule', 'cebul', 'cebuli']],
  ['m', false, ['ząbek', 'ząbki', 'ząbków', 'ząbka']],
  ['m', false, ['ziemniak', 'ziemniaki', 'ziemniaków', 'ziemniaka']],
  ['f', false, ['marchewka', 'marchewki', 'marchewek', 'marchewki']],
  ['f', false, ['marchew', 'marchewki', 'marchewek', 'marchwi']],
  ['m', false, ['pomidor', 'pomidory', 'pomidorów', 'pomidora']],
  ['f', false, ['papryka', 'papryki', 'papryk', 'papryki']],
  ['f', false, ['papryczka', 'papryczki', 'papryczek', 'papryczki']],
  ['m', false, ['ogórek', 'ogórki', 'ogórków', 'ogórka']],
  ['f', false, ['cytryna', 'cytryny', 'cytryn', 'cytryny']],
  ['f', false, ['limonka', 'limonki', 'limonek', 'limonki']],
  ['f', false, ['pomarańcza', 'pomarańcze', 'pomarańczy', 'pomarańczy']],
  ['n', false, ['jabłko', 'jabłka', 'jabłek', 'jabłka']],
  ['f', false, ['gruszka', 'gruszki', 'gruszek', 'gruszki']],
  ['f', false, ['śliwka', 'śliwki', 'śliwek', 'śliwki']],
  ['f', false, ['truskawka', 'truskawki', 'truskawek', 'truskawki']],
  ['m', false, ['banan', 'banany', 'bananów', 'banana']],
  ['f', false, ['bułka', 'bułki', 'bułek', 'bułki']],
  ['m', false, ['por', 'pory', 'porów', 'pora']],
  ['m', false, ['burak', 'buraki', 'buraków', 'buraka']],
  ['m', false, ['bakłażan', 'bakłażany', 'bakłażanów', 'bakłażana']],
  ['f', false, ['cukinia', 'cukinie', 'cukinii', 'cukinii']],
  ['f', false, ['pieczarka', 'pieczarki', 'pieczarek', 'pieczarki']],
  ['f', false, ['rzodkiewka', 'rzodkiewki', 'rzodkiewek', 'rzodkiewki']],
  ['f', false, ['kiełbaska', 'kiełbaski', 'kiełbasek', 'kiełbaski']],
  ['f', false, ['parówka', 'parówki', 'parówek', 'parówki']],
  ['f', false, ['tortilla', 'tortille', 'tortilli', 'tortilli']],
  ['f', false, ['pierś', 'piersi', 'piersi', 'piersi']],
  ['n', false, ['udko', 'udka', 'udek', 'udka']],
  ['n', false, ['skrzydełko', 'skrzydełka', 'skrzydełek', 'skrzydełka']],
  ['m', false, ['filet', 'filety', 'filetów', 'fileta']],
]

const EN_NOUNS: [boolean, string, string][] = [
  [true, 'tablespoon', 'tablespoons'],
  [true, 'teaspoon', 'teaspoons'],
  [true, 'cup', 'cups'],
  [true, 'pinch', 'pinches'],
  [false, 'egg', 'eggs'],
  [false, 'clove', 'cloves'],
  [false, 'onion', 'onions'],
  [false, 'tomato', 'tomatoes'],
  [false, 'potato', 'potatoes'],
  [false, 'carrot', 'carrots'],
  [false, 'lemon', 'lemons'],
  [false, 'lime', 'limes'],
  [false, 'apple', 'apples'],
  [false, 'banana', 'bananas'],
  [false, 'slice', 'slices'],
  [false, 'can', 'cans'],
  [false, 'stick', 'sticks'],
  [false, 'piece', 'pieces'],
  [false, 'bunch', 'bunches'],
  [false, 'head', 'heads'],
  [false, 'sprig', 'sprigs'],
  [false, 'leaf', 'leaves'],
  [false, 'pepper', 'peppers'],
  [false, 'sausage', 'sausages'],
  [false, 'fillet', 'fillets'],
]

const NOUNS = new Map<string, Noun>()
for (const [gender, fraction, forms] of PL_NOUNS) {
  const noun: Noun = { forms, gender, fraction, lang: 'pl' }
  for (const f of forms) if (!NOUNS.has(f)) NOUNS.set(f, noun)
}
for (const [fraction, sg, pl] of EN_NOUNS) {
  const noun: Noun = { forms: [sg, pl, pl, pl], gender: 'm', fraction, lang: 'en' }
  for (const f of [sg, pl]) NOUNS.set(f, noun)
}

/** Przymiotniki o regularnej odmianie (twardotematowe na -y i miękkie na -i) */
const ADJ_BASES = [
  'duży', 'mały', 'średni', 'świeży', 'młody', 'twardy', 'dojrzały', 'cały', 'ostry', 'gruby', 'drobny',
  'wędzony', 'surowy', 'gotowany', 'mielony', 'suszony', 'kwaśny', 'czerwony', 'zielony', 'żółty', 'biały', 'czarny',
]
interface Adj {
  m: string; f: string; n: string; pl: string; gpl: string; gsgM: string; gsgF: string
}
function adjForms(base: string): Adj {
  const soft = base.endsWith('i')
  const s = base.slice(0, -1)
  return soft
    ? { m: s + 'i', f: s + 'ia', n: s + 'ie', pl: s + 'ie', gpl: s + 'ich', gsgM: s + 'iego', gsgF: s + 'iej' }
    : { m: s + 'y', f: s + 'a', n: s + 'e', pl: s + 'e', gpl: s + 'ych', gsgM: s + 'ego', gsgF: s + 'ej' }
}
const ADJECTIVES = new Map<string, Adj>()
for (const base of ADJ_BASES) {
  const a = adjForms(base)
  for (const f of Object.values(a)) ADJECTIVES.set(f, a)
}

/** Nazwy jednostek, których się nie odmienia */
const METRIC = new Set(['g', 'gr', 'mg', 'kg', 'dag', 'ml', 'l', 'dl', 'cl'])
const INVARIANT = new Set([...METRIC, 'tbsp', 'tsp', 'oz', 'lb', 'lbs', 'szt', 'łyż', 'łyżk', 'opak', 'ząb', 'pęcz', 'plast'])

/** 0 = 1 sztuka, 1 = 2–4, 2 = 5+, 3 = ułamek (dopełniacz lp.); po angielsku: singular tylko dla ≤ 1 */
function formIndex(value: number, lang: 'pl' | 'en'): 0 | 1 | 2 | 3 {
  if (lang === 'en') return value <= 1 ? 0 : 1
  if (!Number.isInteger(value)) return 3
  if (value === 1) return 0
  const mod10 = value % 10
  const mod100 = value % 100
  return mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14) ? 1 : 2
}

function adjectiveFor(adj: Adj, gender: Gender, idx: 0 | 1 | 2 | 3): string {
  if (idx === 0) return gender === 'f' ? adj.f : gender === 'n' ? adj.n : adj.m
  if (idx === 1) return adj.pl
  if (idx === 2) return adj.gpl
  return gender === 'f' ? adj.gsgF : adj.gsgM
}

const matchCase = (original: string, replacement: string) =>
  original[0] && original[0] !== original[0].toLowerCase() ? replacement[0].toUpperCase() + replacement.slice(1) : replacement

/* — liczby — */

const trimZeros = (n: number, digits: number) => String(Number(n.toFixed(digits))).replace('.', ',')

/** Ćwiartki (do 4), połówki (do 10), potem liczby całe: 1¼, 2½, 12 */
function fmtFraction(v: number): string {
  const step = v < 4 ? 0.25 : v < 10 ? 0.5 : 1
  let r = Math.round(v / step) * step
  if (r === 0) r = step
  const whole = Math.floor(r)
  const frac = Number((r - whole).toFixed(2))
  if (frac === 0) return String(whole)
  const glyph = VULGAR_OUT[frac] ?? trimZeros(frac, 2).replace(/^0/, '')
  return whole > 0 ? `${whole}${glyph}` : glyph
}

/** Połówki dla rzeczy liczonych na sztuki: 1, 1½, 2, 2½ … */
function fmtCount(v: number): string {
  const step = v < 10 ? 0.5 : 1
  let r = Math.round(v / step) * step
  if (r === 0) r = step
  return r % 1 === 0.5 ? `${Math.floor(r)}½`.replace(/^0/, '') : String(r)
}

/** Gramy / mililitry: zaokrąglamy do sensownej dokładności (≥100 → co 5) */
function fmtSmall(v: number): string {
  if (v >= 100) return String(Math.round(v / 5) * 5)
  if (v >= 10) return String(Math.round(v))
  return trimZeros(v, 1)
}

interface Measured { values: string[]; unit: string }

/** Przelicza wartości na wagę/objętość i wybiera jednostkę (g ↔ kg, ml ↔ l) */
function scaleMetric(unit: string, values: number[]): Measured {
  const u = unit.toLowerCase()
  const max = Math.max(...values)
  const family = u === 'kg' || u === 'g' || u === 'gr' ? 'g' : u === 'l' || u === 'ml' ? 'ml' : null

  if (family) {
    const factor = u === 'kg' || u === 'l' ? 1000 : 1
    const base = values.map((v) => v * factor) // g albo ml
    const big = family === 'g' ? 'kg' : 'l'
    if (Math.max(...base) >= 1000) return { values: base.map((v) => trimZeros(v / 1000, 2)), unit: big }
    return { values: base.map(fmtSmall), unit: family }
  }
  if (u === 'dag') return { values: values.map((v) => (v >= 10 ? String(Math.round(v)) : trimZeros(v, 1))), unit }
  if (u === 'mg') return { values: values.map((v) => String(Math.max(1, Math.round(v)))), unit }
  return { values: values.map((v) => trimZeros(v, max >= 10 ? 0 : 1)), unit } // dl, cl
}

/* — parser początku linii — */

// 1 · 1,5 · 1/2 · ½ · 1½ · 1 1/2 · 2 i 1/2
const NUM_RE = new RegExp(
  String.raw`(\d+)\s*(?:i\s+)?(?:(\d+)\s*/\s*(\d+)|([${VF}]))|(\d+)\s*/\s*(\d+)|(\d+(?:[.,]\d+)?)|([${VF}])`,
  'y',
)
const RANGE_RE = /(?:\s*[-–—]\s*|\s+do\s+)/iy
// dłuższe słowa przed skrótami — inaczej „około” zostałoby dopasowane jako „ok” i liczba by nie została znaleziona
const APPROX_RE = /(?:(?:około|ok\.?|circa|ca\.?)\s*|~\s*)?/iy
const HALF_RE = new RegExp(String.raw`pół(?![${L}])`, 'iy')
const LABEL_RE = new RegExp(
  String.raw`^[^\d${VF}]{2,60}?\s*[:–—-]\s*(?=(?:(?:około|ok\.?|~)\s*)?(?:\d|[${VF}]|pół(?![${L}])))`,
  'i',
)

function numberAt(s: string, pos: number): { value: number; end: number } | null {
  NUM_RE.lastIndex = pos
  const m = NUM_RE.exec(s)
  if (m) {
    let value: number
    if (m[1] !== undefined) value = Number(m[1]) + (m[2] !== undefined ? Number(m[2]) / Number(m[3]) : VULGAR[m[4]])
    else if (m[5] !== undefined) value = Number(m[5]) / Number(m[6])
    else if (m[7] !== undefined) value = Number(m[7].replace(',', '.'))
    else value = VULGAR[m[8]]
    return Number.isFinite(value) ? { value, end: m.index + m[0].length } : null
  }
  HALF_RE.lastIndex = pos
  const h = HALF_RE.exec(s)
  return h ? { value: 0.5, end: h.index + h[0].length } : null
}

interface Quantity {
  prefix: string // wszystko przed liczbą (etykieta, „ok.”)
  value: number
  max?: number
  separator?: string // oryginalny zapis zakresu: „-”, „–”, „ do ”
  end: number
}

function findQuantity(text: string): Quantity | null {
  const tryAt = (start: number): Quantity | null => {
    APPROX_RE.lastIndex = start
    const approx = APPROX_RE.exec(text)
    const pos = start + (approx ? approx[0].length : 0)
    const first = numberAt(text, pos)
    if (!first) return null
    const q: Quantity = { prefix: text.slice(0, pos), value: first.value, end: first.end }
    RANGE_RE.lastIndex = first.end
    const sep = RANGE_RE.exec(text)
    if (sep) {
      const second = numberAt(text, first.end + sep[0].length)
      if (second && second.value >= first.value) {
        q.max = second.value
        q.separator = sep[0]
        q.end = second.end
      }
    }
    return q
  }
  const skip = /^\s*/.exec(text)![0].length
  const direct = tryAt(skip)
  if (direct) return direct
  const label = LABEL_RE.exec(text) // „mąka pszenna – 200 g”
  return label ? tryAt(label[0].length) : null
}

/* — składanie wyniku — */

export interface ScaledLine {
  text: string
  /** true, gdy ilość została przeliczona */
  scaled: boolean
}

const WORD_RE = new RegExp(String.raw`^(\s*)([${L}]+)(\.?)`)

/**
 * Mnoży ilość w linii składnika przez `factor` (np. 6 porcji / 4 porcje = 1,5).
 * Zwraca tę samą linię, gdy nie ma czego przeliczyć albo `factor` wynosi 1.
 */
export function scaleIngredient(text: string, factor: number): ScaledLine {
  const unchanged = { text, scaled: false }
  if (!Number.isFinite(factor) || factor <= 0 || Math.abs(factor - 1) < 1e-9) return unchanged

  const q = findQuantity(text)
  if (!q) return unchanged

  const values = [q.value * factor, ...(q.max !== undefined ? [q.max * factor] : [])]
  const top = Math.max(...values)
  const rest = text.slice(q.end)
  const join = (nums: string[]) => nums.join(q.separator ?? '–')

  const word = WORD_RE.exec(rest)
  const lower = word?.[2].toLowerCase()

  // 1) jednostki miarowe, których się nie odmienia: g, kg, ml, l …
  if (word && lower && INVARIANT.has(lower)) {
    if (METRIC.has(lower)) {
      const m = scaleMetric(word[2], values)
      const label = matchCase(word[2], m.unit)
      return { text: q.prefix + join(m.values) + word[1] + label + word[3] + rest.slice(word[0].length), scaled: true }
    }
    return { text: q.prefix + join(values.map(fmtFraction)) + rest, scaled: true }
  }

  // 2) rzeczownik (opcjonalnie z przymiotnikiem albo jednym nieznanym słowem po angielsku)
  const noun = findNoun(rest)
  if (noun) {
    const numbers = values.map(noun.entry.fraction ? fmtFraction : fmtCount)
    // odmieniamy według liczby, którą faktycznie pokazujemy po zaokrągleniu (2,4 → „2½ łyżki”)
    const shown = parseShown(numbers[numbers.length - 1], top)
    return { text: q.prefix + join(numbers) + noun.render(formIndex(shown, noun.entry.lang)), scaled: true }
  }

  // 3) sama liczba bez znanej jednostki („3 rzeczy”, „2 x”) — przeliczamy, nic nie odmieniamy
  return { text: q.prefix + join(values.map(fmtCount)) + rest, scaled: true }
}

/** Liczba, jaką faktycznie pokazujemy po zaokrągleniu (½ → 0,5; 1½ → 1,5) */
function parseShown(displayed: string, fallback: number): number {
  const m = /^(\d+)?([¼½¾])?$/.exec(displayed)
  if (m) return Number(m[1] ?? 0) + (m[2] ? VULGAR[m[2]] : 0)
  const n = Number(displayed.replace(',', '.'))
  return Number.isFinite(n) ? n : fallback
}

interface NounMatch {
  entry: Noun
  /** Buduje resztę linii z rzeczownikiem (i przymiotnikiem) w formie zgodnej z liczbą */
  render: (idx: 0 | 1 | 2 | 3) => string
}

function findNoun(rest: string): NounMatch | null {
  const first = WORD_RE.exec(rest)
  if (!first) return null
  const w1 = first[2]
  const direct = NOUNS.get(w1.toLowerCase())
  if (direct) {
    const tail = rest.slice(first[0].length)
    return {
      entry: direct,
      render: (idx) => first[1] + matchCase(w1, direct.forms[idx]) + first[3] + tail,
    }
  }

  const afterFirst = rest.slice(first[0].length)
  const second = WORD_RE.exec(afterFirst)
  const noun2 = second ? NOUNS.get(second[2].toLowerCase()) : undefined
  if (!second || !noun2) return null
  const tail = afterFirst.slice(second[0].length)

  const adj = ADJECTIVES.get(w1.toLowerCase())
  if (adj && noun2.lang === 'pl') {
    return {
      entry: noun2,
      render: (idx) =>
        first[1] + matchCase(w1, adjectiveFor(adj, noun2.gender, idx)) + first[3] +
        second[1] + matchCase(second[2], noun2.forms[idx]) + second[3] + tail,
    }
  }
  // angielskie „2 large eggs”: przymiotnik się nie odmienia, odmieniamy tylko rzeczownik
  if (noun2.lang === 'en') {
    return {
      entry: noun2,
      render: (idx) => first[1] + w1 + first[3] + second[1] + matchCase(second[2], noun2.forms[idx]) + second[3] + tail,
    }
  }
  return null
}

/** Współczynnik przeliczenia porcji; null, gdy nie da się go określić */
export function scaleFactor(original: number | undefined, target: number): number | null {
  if (!original || original <= 0 || !Number.isFinite(target) || target <= 0) return null
  return target / original
}
