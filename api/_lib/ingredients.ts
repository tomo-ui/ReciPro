/**
 * Ujednolicanie linii składników: ilość na początku, potem składnik; wagi i objętości metryczne.
 *
 *   "Mąka pszenna – 200 g"        → "200 g mąka pszenna"
 *   "1/2 szklanki mleka"          → "125 ml mleka"
 *   "pół szklanki mąki"           → "70 g mąki"
 *   "1 szklanka (250 ml) mleka"   → "250 ml mleka"
 *   "1/2 cebuli"                  → "50 g cebuli"
 *   "0,5 kg mięsa"                → "500 g mięsa"
 *
 * Moduł jest czysty (bez importów), bo używają go i funkcje serwerowe (import przepisów),
 * i aplikacja (zapis ręcznie dodanych przepisów oraz wyświetlanie starszych). Leży w api/_lib,
 * żeby Vercel dołączył go do funkcji bez wychodzenia poza katalog api; aplikacja importuje go
 * przez src/lib/ingredients.ts.
 *
 * Przeliczenia szklanek i łyżek na gramy są przybliżone (typowe gęstości produktów).
 * Linie bez ilości („sól do smaku”) zostają bez zmian.
 */

const L = 'A-Za-zĄąĆćĘęŁłŃńÓóŚśŹźŻż'
const NB = `(?![${L}])` // koniec słowa (\b nie zna polskich liter)

const VULGAR: Record<string, number> = {
  '½': 1 / 2, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 1 / 4, '¾': 3 / 4, '⅕': 1 / 5, '⅖': 2 / 5, '⅗': 3 / 5,
  '⅘': 4 / 5, '⅙': 1 / 6, '⅚': 5 / 6, '⅛': 1 / 8, '⅜': 3 / 8, '⅝': 5 / 8, '⅞': 7 / 8,
}
const VF = Object.keys(VULGAR).join('')

/* — liczby — */

const NUM = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?[${VF}]?|[${VF}]|półtorej|półtora|pół${NB})`
const SEP = String.raw`(?:\s*[-–—]\s*|\s+do\s+)`
const RANGE = `${NUM}(?:${SEP}${NUM})?`

function parseNum(token: string): number {
  const t = token.trim().toLowerCase()
  if (t === 'pół') return 0.5
  if (t === 'półtora' || t === 'półtorej') return 1.5
  let total = 0
  let s = t
  const v = new RegExp(`[${VF}]$`).exec(s)
  if (v) {
    total += VULGAR[v[0]]
    s = s.slice(0, -1)
  }
  if (!s) return total
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(s)
  if (mixed) return total + Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3])
  const frac = /^(\d+)\/(\d+)$/.exec(s)
  if (frac) return total + Number(frac[1]) / Number(frac[2])
  return total + Number(s.replace(',', '.'))
}

function parseRange(text: string): [number, number | undefined] {
  const parts = text.split(new RegExp(SEP, 'i')).filter(Boolean)
  const lo = parseNum(parts[0])
  const hi = parts.length > 1 ? parseNum(parts[1]) : undefined
  return [lo, hi]
}

const fmt = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',')
const fmtRange = (lo: number, hi: number | undefined) => (hi === undefined ? fmt(lo) : `${fmt(lo)}-${fmt(hi)}`)

/** Ilość po przeliczeniu miary domowej: zaokrąglamy, bo „128,3 g” nie ma sensu */
function roundAmount(n: number): number {
  if (n < 10) return Math.max(0.5, Math.round(n * 2) / 2)
  if (n < 20) return Math.round(n)
  if (n < 500) return Math.round(n / 5) * 5
  return Math.round(n / 10) * 10
}

/* — jednostki — */

type Metric = { kind: 'g' | 'ml'; factor: number }

const METRIC_UNITS: [string, Metric][] = [
  [`kilogram[${L}]*|kg`, { kind: 'g', factor: 1000 }],
  [`dekagram[${L}]*|dkg|dag`, { kind: 'g', factor: 10 }],
  [`gram[${L}]*|gr|g`, { kind: 'g', factor: 1 }],
  [`mililitr[${L}]*|ml`, { kind: 'ml', factor: 1 }],
  [`litr[${L}]*|l`, { kind: 'ml', factor: 1000 }],
  [`lbs?|pounds?`, { kind: 'g', factor: 453.6 }],
  [`oz|ounces?`, { kind: 'g', factor: 28.35 }],
]
const HOUSE_UNITS: [string, number][] = [
  [`łyżeczk[${L}]*|teaspoons?|tsp`, 5],
  [`łyżk[${L}]*|tablespoons?|tbsp`, 15],
  [`szklan[${L}]*|cups?`, 250],
  [`kub(?:ek|k)[${L}]*`, 250],
  [`filiżank[${L}]*`, 150],
]
// „szt.” przy przenoszeniu ilości z końca linii pomijamy („Jajka – 3 szt.” → „3 jajka”)
const PIECE = String.raw`szt\.?|sztuk[${L}]*`
const POUCH = `szczypt[${L}]*|garś[${L}]*|garsc[${L}]*`

const src = (list: [string, unknown][]) => list.map(([s]) => s).join('|')
const METRIC_RE = src(METRIC_UNITS)
const HOUSE_RE = src(HOUSE_UNITS)
const ADJ = String.raw`(?:(?:płask|czubat|duż|mał|gładk|kopiast|pełn)[${L}]*\s+)?`

const isUnit = (source: string, unit: string) => new RegExp(`^(?:${source})$`, 'i').test(unit)
const metricOf = (unit: string) => METRIC_UNITS.find(([s]) => isUnit(s, unit))?.[1]
const houseMl = (unit: string) => HOUSE_UNITS.find(([s]) => isUnit(s, unit))?.[1]

/* — składniki: gęstość (g/ml); brak dopasowania = płyn lub nieznany produkt, zostaje w ml — */

const STUFF: { test: RegExp; density: number }[] = [
  { test: /mąk\w*\s+ziemniaczan|skrobi|krochmal|cornstarch/i, density: 0.6 },
  { test: /mąk|flour/i, density: 0.56 },
  { test: /cukr\w*\s+pud|powdered sugar|icing sugar/i, density: 0.55 },
  { test: /cukr|cukier|sugar/i, density: 0.8 },
  { test: /masł|margaryn|butter/i, density: 0.95 },
  { test: /kakao|cocoa/i, density: 0.45 },
  { test: /sól|soli|salt/i, density: 1.2 },
  { test: /miod|miód|miodu|honey/i, density: 1.4 },
  { test: /ryż|ryżu|rice/i, density: 0.8 },
  { test: /kasz/i, density: 0.75 },
  { test: /owsian|oats/i, density: 0.35 },
  { test: /proszek do pieczenia|baking powder/i, density: 0.9 },
  { test: /sod[ay]\s+oczyszczon|baking soda/i, density: 1 },
  { test: /bułk\w*\s+tart|tarta\s+bułk|breadcrumb/i, density: 0.4 },
  { test: /sezam|mak(?:u)?(?:\s|$)|siemi\w*\s+len|chia/i, density: 0.6 },
  { test: /parmezan|ser\w*\s+(?:żółt|star|tart)|cheese/i, density: 0.4 },
  { test: /twaróg|twarogu|serek/i, density: 0.95 },
  { test: /orzech|migdał|pistacj|nerkowc|almond|walnut/i, density: 0.5 },
  { test: /rodzynk|żurawin|raisin/i, density: 0.65 },
  {
    test: /pieprz|cynamon|kurkum|kmin|kumin|cumin|oregano|bazyli|tymianek|tymianku|majeran|curry|imbir|gałk|papryk\w*\s+(?:słodk|wędzon|ostr|mielon)|chili|goździk|kardamon|zioł|natk|koper|pepper|cinnamon|paprika/i,
    density: 0.4,
  },
]

/** Waga typowej sztuki (g), używana tylko do ułamków: „1/2 cebuli” → „50 g cebuli” */
const PIECE_WEIGHT: [RegExp, number][] = [
  [/cebul|onion/i, 100],
  [/jajk|jaja|jajek|egg/i, 55],
  [/ziemniak|potato/i, 150],
  [/marchew|marchwi|carrot/i, 80],
  [/pomidor|tomato/i, 120],
  [/papryk|pepper/i, 150],
  [/cytryn|lemon/i, 100],
  [/limonk|lime/i, 60],
  [/pomarańcz|orange/i, 200],
  [/jabłk|apple/i, 150],
  [/banan/i, 120],
  [/ogórk|ogórek|cucumber/i, 150],
  [/bułk/i, 60],
  [/cukini|zucchini/i, 300],
  [/(?:^|\s)por(?:u|y|ów|a)?(?:\s|$)|leek/i, 150],
  [/burak|beet/i, 120],
  [/bakłażan|eggplant|aubergine/i, 250],
  [/awokado|avocado/i, 200],
  [/ząbek|ząbk|ząbków/i, 5],
]

/* — wzorce linii — */

const APPROX = /^(?:około|ok\.?|ca\.?|circa|about)\s+/i
// ilość na początku: liczba, opcjonalnie jednostka
const LEAD = new RegExp(String.raw`^(${RANGE})\s*(?:${ADJ}(${METRIC_RE}|${HOUSE_RE}|${PIECE}|${POUCH})${NB})?\s*(.*)$`, 'i')
// „łyżeczka soli”, „szczypta pieprzu”: ilość domyślnie 1
const LEAD_BARE = new RegExp(String.raw`^${ADJ}(${HOUSE_RE}|${POUCH})${NB}\s*(.*)$`, 'i')
const METRIC_PAREN = new RegExp(String.raw`\(\s*(?:około|ok\.?|ca\.?|~)?\s*(${RANGE})\s*(${METRIC_RE})${NB}\s*\)`, 'i')
const HOUSE_PAREN = new RegExp(String.raw`\(\s*(?:około|ok\.?)?\s*${RANGE}\s*${ADJ}(?:${HOUSE_RE})${NB}[^)]*\)`, 'gi')
// ilość na końcu linii: „Nazwa 200 g”, „Nazwa – 200 g”, „Nazwa (200 g)”, „Nazwa: 2”
const QTY_UNIT = String.raw`(${RANGE})\s*${ADJ}(${METRIC_RE}|${HOUSE_RE}|${PIECE})${NB}`
// nazwa jest zachłanna, żeby „Mąka typ 450 – 200 g” nie wzięło „450 – 200” za zakres
const TRAIL_UNIT = new RegExp(String.raw`^([^\d(].*)\s+\(?\s*${QTY_UNIT}\s*\)?\s*$`, 'i')
const TRAIL_UNIT_TIGHT = new RegExp(String.raw`^([^\d(].*)[:–—,-]\s*\(?\s*${QTY_UNIT}\s*\)?\s*$`, 'i')
const TRAIL_BARE = new RegExp(String.raw`^([^\d(].*?[${L}])\s*[:–—]\s*(${RANGE})\s*$`, 'i')

function moveTrailingQuantity(t: string): string {
  if (LEAD.test(t) && /^(?:\d|[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]|pół)/i.test(t)) return t
  if (LEAD_BARE.test(t)) return t
  let name: string
  let qty: string
  let unit: string | undefined
  const m = TRAIL_UNIT.exec(t) ?? TRAIL_UNIT_TIGHT.exec(t)
  if (m) {
    ;[, name, qty, unit] = m
  } else {
    const bare = TRAIL_BARE.exec(t)
    if (!bare) return t
    ;[, name, qty] = bare
  }
  const cleanName = name.replace(/[\s,:–—-]+$/, '').trim()
  if (!cleanName) return t
  const shown = unit && !isUnit(PIECE, unit) ? ` ${unit}` : ''
  const lowered = cleanName.charAt(0).toLowerCase() + cleanName.slice(1)
  return `${qty.trim()}${shown} ${lowered}`
}

function tidy(rest: string): string {
  return rest
    .replace(/^(?:z\s+górką|płaska|czubata|pełna|of)\s+/i, '')
    .replace(/\s+([,.;])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[,;\s]+|[\s,;]+$/g, '')
}

const join = (...parts: string[]) => parts.filter(Boolean).join(' ')

/** Liczby + jednostka; kg i l zostają od jedności wzwyż, poniżej schodzimy do g i ml (0,5 kg → 500 g) */
function amountText(values: number[], kind: 'g' | 'ml'): string {
  if (Math.min(...values) >= 1000 || (values.length === 1 && values[0] >= 1000)) {
    return `${values.map((n) => fmt(n / 1000)).join('-')} ${kind === 'g' ? 'kg' : 'l'}`
  }
  return `${values.map(fmt).join('-')} ${kind}`
}

function metricAmount(lo: number, hi: number | undefined, m: Metric): string {
  const exact = Number.isInteger(m.factor)
  const conv = (n: number) => (exact ? n * m.factor : roundAmount(n * m.factor))
  return amountText([conv(lo), ...(hi !== undefined ? [conv(hi)] : [])], m.kind)
}

function convertedAmount(lo: number, hi: number | undefined, perUnit: number, kind: 'g' | 'ml'): string {
  const conv = (n: number) => roundAmount(n * perUnit)
  return amountText([conv(lo), ...(hi !== undefined ? [conv(hi)] : [])], kind)
}

function normalizeLeading(t: string): string {
  let lo: number
  let hi: number | undefined
  let unit: string | undefined
  let rest: string

  const lead = LEAD.exec(t)
  if (lead) {
    ;[lo, hi] = parseRange(lead[1])
    unit = lead[2]
    rest = lead[3]
  } else {
    const bare = LEAD_BARE.exec(t)
    if (!bare) return t
    lo = 1
    unit = bare[1]
    rest = bare[2]
  }
  if (!Number.isFinite(lo) || (hi !== undefined && !Number.isFinite(hi))) return t

  // 1) już metrycznie: porządkujemy (0,5 kg → 500 g, 20 dag → 200 g) i zdejmujemy miary domowe w nawiasach
  const metric = unit ? metricOf(unit) : undefined
  if (metric) return join(metricAmount(lo, hi, metric), tidy(rest.replace(HOUSE_PAREN, '')))

  // 2) miara domowa: waga podana obok wygrywa, w przeciwnym razie przeliczamy
  const ml = unit ? houseMl(unit) : undefined
  if (ml !== undefined) {
    const inParen = METRIC_PAREN.exec(rest)
    if (inParen) {
      const [plo, phi] = parseRange(inParen[1])
      const remainder = tidy(rest.replace(METRIC_PAREN, '').replace(HOUSE_PAREN, ''))
      return join(metricAmount(plo, phi, metricOf(inParen[2])!), remainder)
    }
    const remainder = tidy(rest.replace(HOUSE_PAREN, ''))
    const density = STUFF.find((s) => s.test.test(remainder))?.density
    return join(density ? convertedAmount(lo, hi, ml * density, 'g') : convertedAmount(lo, hi, ml, 'ml'), remainder)
  }

  // 3) szczypta, garść: liczba na początku, jednostka zostaje
  if (unit && isUnit(POUCH, unit)) return join(fmtRange(lo, hi), unit, tidy(rest))

  // 4) sztuki: całkowite zostają bez zmian, ułamki zamieniamy na wagę albo liczbę dziesiętną
  if (Number.isInteger(lo) && (hi === undefined || Number.isInteger(hi))) return t
  const pieceUnit = !unit || isUnit(PIECE, unit)
  if (/^kostk/i.test(rest) && /masł|margaryn/i.test(rest)) {
    return join(convertedAmount(lo, hi, 200, 'g'), tidy(rest.replace(new RegExp(`^kostk[${L}]*\\s*`, 'i'), '')))
  }
  const weight = pieceUnit ? PIECE_WEIGHT.find(([re]) => re.test(rest.slice(0, 40)))?.[1] : undefined
  if (weight !== undefined) return join(convertedAmount(lo, hi, weight, 'g'), tidy(rest))
  return join(fmtRange(lo, hi), unit ?? '', tidy(rest))
}

export function normalizeIngredient(input: string): string {
  let t = input.replace(/\s+/g, ' ').trim()
  t = t.replace(/^[-•*·▪●–—]\s+/, '')
  if (!t) return t
  t = t.replace(APPROX, '')
  t = moveTrailingQuantity(t)
  return normalizeLeading(t).trim()
}

/* — odczyt ilości z linii (dla kalkulatora wartości odżywczych) — */

export interface ParsedIngredient {
  /** Ilość: gramy, mililitry albo sztuki; brak = „do smaku” */
  kind?: 'g' | 'ml' | 'count'
  value?: number
  /** Słowo jednostki przy sztukach: „puszka”, „ząbki”, „szt.” */
  unitWord?: string
  /** Nazwa składnika bez ilości */
  name: string
}

/** Rozbija linię na ilość i nazwę. Linię najpierw ujednolica (normalizeIngredient), zakresy zastępuje środkiem. */
export function parseIngredient(input: string): ParsedIngredient {
  const text = normalizeIngredient(input)
  const lead = LEAD.exec(text)
  if (!lead || !/^(?:\d|[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]|pół)/i.test(text)) {
    const bare = LEAD_BARE.exec(text)
    if (bare) return { kind: 'count', value: 1, unitWord: bare[1], name: tidy(bare[2]) }
    return { name: text }
  }
  const [lo, hi] = parseRange(lead[1])
  if (!Number.isFinite(lo)) return { name: text }
  const value = hi !== undefined && Number.isFinite(hi) ? (lo + hi) / 2 : lo
  const unit = lead[2]
  const rest = tidy(lead[3])
  const metric = unit ? metricOf(unit) : undefined
  if (metric) return { kind: metric.kind, value: value * metric.factor, name: rest }
  return { kind: 'count', value, unitWord: unit, name: rest }
}

/** Waga typowej sztuki (g) na podstawie nazwy składnika, gdy baza nie podaje wagi porcji */
export function pieceWeightOf(name: string): number | undefined {
  return PIECE_WEIGHT.find(([re]) => re.test(name.slice(0, 40)))?.[1]
}
