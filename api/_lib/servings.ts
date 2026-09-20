import { parseIngredient, pieceWeightOf } from './ingredients.js'

/**
 * Szacowanie liczby porcji, gdy przepis jej nie podaje. Model językowy słabo sumuje gramy i łatwo
 * myli rodzaj dania, więc liczymy dwiema drogami i porównujemy:
 *  1. wagą składników (sumujemy g, ml i sztuki) dzieloną przez typową wagę porcji danego rodzaju dania,
 *  2. odpowiedzią AI (ona też podaje rodzaj dania, a gdy AI zawiedzie, rodzaj bierzemy z tytułu).
 * Gdy obie drogi się zgadzają, zostaje odpowiedź AI; gdy się rozjeżdżają, wygrywa liczenie z wagi.
 */

export type DishKind = 'soup' | 'main' | 'salad' | 'side' | 'dessert' | 'cake' | 'bread' | 'sauce' | 'snack' | 'drink' | 'breakfast'

export const DISH_KINDS: DishKind[] = ['soup', 'main', 'salad', 'side', 'dessert', 'cake', 'bread', 'sauce', 'snack', 'drink', 'breakfast']

/** Typowa waga składników (surowych, razem z wodą) przypadająca na jedną porcję dorosłej osoby */
export const PORTION_GRAMS: Record<DishKind, number> = {
  soup: 400,
  main: 400,
  salad: 250,
  side: 200,
  dessert: 160,
  cake: 110,
  bread: 70,
  sauce: 60,
  snack: 100,
  drink: 300,
  breakfast: 300,
}

const LABEL: Record<DishKind, string> = {
  soup: 'zupa',
  main: 'danie główne',
  salad: 'sałatka',
  side: 'dodatek',
  dessert: 'deser',
  cake: 'ciasto lub wypiek',
  bread: 'pieczywo',
  sauce: 'sos lub dip',
  snack: 'przekąska',
  drink: 'napój',
  breakfast: 'śniadanie',
}

export const MAX_SERVINGS = 24
/** Poniżej tej części pozycji z ilością, których wagę umiemy ocenić, nie ufamy sumie */
const MIN_COVERAGE = 0.6
const MIN_GRAMS = 80

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, 'g'), '')
    .replace(/ł/g, 'l')

/** Rodzaj dania na podstawie tytułu i tagów (gdy AI nie odpowiedziało) */
const KIND_WORDS: [DishKind, RegExp][] = [
  ['soup', /\b(zupa|zupy|krem z|barszcz|rosol|zurek|chlodnik|kapusniak|krupnik|flaki|bulion)/],
  ['drink', /\b(napoj|koktajl|smoothie|lemoniad|kompot|herbata|kawa|sok |shake|drink)/],
  ['sauce', /\b(sos|dip|pesto|hummus|dressing|marynata|salsa|smarowidlo|majonez)/],
  ['salad', /\b(salatk|surowk|salad|coleslaw)/],
  ['cake', /\b(ciasto|sernik|szarlotk|babka|makowiec|tort|murzynek|brownie|placek|piernik|keks|muffin|babeczk|ciasteczk|ciastka|biszkopt|drozdzowk|rogal|pączk|paczk|tarta|quiche)/],
  ['bread', /\b(chleb|bulk|bagiet|focaccia|grzank|pieczywo)/],
  ['dessert', /\b(deser|budyn|mus |panna cotta|tiramisu|lody|kisiel|galaretk|krem |creme|parfait)/],
  ['breakfast', /\b(owsiank|omlet|jajecznic|granola|sniadani|nalesnik)/],
  ['snack', /\b(przekask|chipsy|batonik|krakers|kulki|chrupki|popcorn)/],
  ['side', /\b(dodatek|frytki|puree|kasza|ryz |ziemniaki pieczone|surowka)/],
]

export function kindFromTitle(title: string, tags: string[] = []): DishKind | undefined {
  const text = `${fold(title)} ${tags.map(fold).join(' ')} `
  return KIND_WORDS.find(([, re]) => re.test(text))?.[0]
}

export interface Weight {
  /** Łączna waga składników, których ilość umiemy ocenić */
  grams: number
  /** Pozycje z ilością, których wagę oceniliśmy */
  weighed: number
  /** Pozycje z ilością (bez „do smaku”) */
  withAmount: number
}

const isWater = (name: string) => /^(woda|wody|wode|water)\b/i.test(fold(name).trim())
const COOKING_WATER = /do gotowania|do ugotowania|do blanszowania|do wrzatku/

/**
 * Waga składników przepisu. Gramy i ml liczymy wprost (1 ml ≈ 1 g), sztuki przez typową wagę.
 * Woda do gotowania makaronu czy ziemniaków nie trafia do dania, więc poza zupami i napojami ją pomijamy.
 */
export function totalWeight(ingredients: { text: string }[], kind?: DishKind): Weight {
  let grams = 0
  let weighed = 0
  let withAmount = 0
  for (const { text } of ingredients) {
    const p = parseIngredient(text)
    if (p.kind === undefined || p.value === undefined) continue
    withAmount++
    if (isWater(p.name) && (kind !== 'soup' && kind !== 'drink' || COOKING_WATER.test(fold(text)))) {
      weighed++ // policzona, ale nie wlicza się do dania
      continue
    }
    let g: number | undefined
    if (p.kind === 'g' || p.kind === 'ml') g = p.value
    else {
      const word = fold(p.unitWord ?? '')
      if (/puszk/.test(word)) g = 400 * p.value
      else if (/szczypt|garsc/.test(word)) g = 5 * p.value
      else if (/plaster|kromk/.test(word)) g = 25 * p.value
      else {
        const each = pieceWeightOf(p.name)
        g = each === undefined ? undefined : each * p.value
      }
    }
    if (g === undefined) continue
    grams += g
    weighed++
  }
  return { grams, weighed, withAmount }
}

/** Liczba porcji z wagi i rodzaju dania; undefined, gdy danych jest za mało */
export function servingsFromWeight(kind: DishKind | undefined, w: Weight): number | undefined {
  if (!kind || w.withAmount === 0 || w.weighed / w.withAmount < MIN_COVERAGE || w.grams < MIN_GRAMS) return undefined
  const n = Math.round(w.grams / PORTION_GRAMS[kind])
  return Math.min(MAX_SERVINGS, Math.max(1, n))
}

export interface Choice {
  servings: number
  /** Krótkie uzasadnienie do pokazania użytkownikowi */
  basis: string
}

const fmtWeight = (g: number) => (g >= 1000 ? `${(Math.round(g / 100) / 10).toString().replace('.', ',')} kg` : `${Math.round(g / 10) * 10} g`)

/**
 * Wybiera liczbę porcji z odpowiedzi AI i z liczenia z wagi.
 * Zgodne (różnica do ok. 40%): zostaje odpowiedź AI. Rozbieżne: wygrywa waga, a przy słabym pokryciu średnia geometryczna.
 */
export function chooseServings(input: { ai?: number; kind?: DishKind; weight: Weight }): Choice | undefined {
  const { ai, kind, weight } = input
  const byWeight = servingsFromWeight(kind, weight)
  const coverage = weight.withAmount ? weight.weighed / weight.withAmount : 0
  const why = kind && byWeight !== undefined ? `ok. ${fmtWeight(weight.grams)} składników; ${LABEL[kind]} to zwykle ok. ${PORTION_GRAMS[kind]} g na porcję` : ''

  if (ai !== undefined && byWeight !== undefined) {
    const ratio = Math.max(ai, byWeight) / Math.min(ai, byWeight)
    if (ratio <= 1.4) return { servings: ai, basis: `${why}; szacunek AI się zgadza` }
    if (coverage >= 0.8) return { servings: byWeight, basis: `${why}; poprawione względem AI (${ai})` }
    const mean = Math.min(MAX_SERVINGS, Math.max(1, Math.round(Math.sqrt(ai * byWeight))))
    return { servings: mean, basis: `${why}; średnia z szacunku AI (${ai}) i wagi` }
  }
  if (byWeight !== undefined) return { servings: byWeight, basis: why }
  if (ai !== undefined) return { servings: ai, basis: 'szacunek AI z rodzaju dania i ilości składników' }
  return undefined
}
