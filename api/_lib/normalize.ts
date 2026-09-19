import { normalizeIngredient } from './ingredients.js'
import type { IngredientLine, ParseMethod, RecipeDraft, StepLine } from '../../src/types/recipe.js'

// Katalog `_lib` nie jest routem Vercela. Importy względne z rozszerzeniem `.js`,
// bo funkcje działają jako ESM w Node (bez aliasu `@/`).

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  deg: '°',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
}

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })
}

/** Usuwa znaczniki HTML (zachowując podziały wierszy), potem dekoduje encje */
export function stripTags(s: string): string {
  return decodeEntities(
    s
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|li|div|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
}

/** Tekst wieloliniowy: normalizuje spacje, zostawia pojedyncze \n */
export function cleanText(s: string): string {
  return s
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t ​]+/g, ' ')
    .replace(/ *\n[ \n]*/g, '\n')
    .trim()
}

/** Jedna linia tekstu z HTML-em/encjami */
export function oneLine(s: string): string {
  return cleanText(stripTags(s)).replace(/\n+/g, ' ')
}

export function splitLines(s: string): string[] {
  return cleanText(stripTags(s))
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

/** ISO 8601 (PT1H30M, P0DT45M) → minuty. Liczba traktowana jako minuty. */
export function parseDurationMinutes(v: unknown): number | undefined {
  if (typeof v === 'number') return v > 0 && Number.isFinite(v) ? Math.round(v) : undefined
  if (typeof v !== 'string') return undefined
  const m = v
    .trim()
    .match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i)
  if (!m) return undefined
  const [, d, h, min, s] = m
  const total =
    Number(d ?? 0) * 1440 + Number(h ?? 0) * 60 + Number(min ?? 0) + Math.round(Number(s ?? 0) / 60)
  return total > 0 ? total : undefined
}

/** recipeYield bywa: 4 | "4" | "4 porcje" | ["4", "4 servings"] | "4-6" */
export function parseServings(v: unknown): number | undefined {
  const first = Array.isArray(v) ? v[0] : v
  const n = typeof first === 'number' ? first : parseInt(String(first ?? '').match(/\d+/)?.[0] ?? '', 10)
  return Number.isFinite(n) && n > 0 && n <= 500 ? Math.round(n) : undefined
}

export function normalizeTags(...sources: unknown[]): string[] {
  const out = new Set<string>()
  for (const src of sources) {
    const items = Array.isArray(src) ? src : typeof src === 'string' ? src.split(',') : []
    for (const item of items) {
      if (typeof item !== 'string') continue
      const t = oneLine(item).toLowerCase()
      if (t && t.length <= 30) out.add(t)
    }
  }
  return [...out].slice(0, 8)
}

/** Rozwiązuje względny URL i przepuszcza tylko http(s) */
export function resolveHttpUrl(u: unknown, base: string): string | undefined {
  if (typeof u !== 'string' || !u.trim()) return undefined
  try {
    const url = new URL(u.trim(), base)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined
  } catch {
    return undefined
  }
}

/** Zrzuca tytuł strony do samej nazwy przepisu: "Placki | Kuchnia Lidla" → "Placki" */
export function cleanPageTitle(t: string): string {
  return oneLine(t).split(/\s+[|–—]\s+|\s+-\s+/)[0].trim()
}

function uniqueLines<T extends { text: string; group?: string }>(lines: T[]): T[] {
  const seen = new Set<string>()
  return lines.filter((l) => {
    const key = JSON.stringify([l.group ?? '', l.text])
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function clean<T extends { text: string; group?: string }>(lines: T[], maxLen: number): T[] {
  return uniqueLines(
    lines
      .map((l) => ({ ...l, text: oneLine(l.text).slice(0, maxLen), group: l.group ? oneLine(l.group) || undefined : undefined }))
      .filter((l) => l.text.length > 0),
  )
}

export interface RawRecipe {
  title?: string
  description?: string
  image_url?: string
  source_url?: string
  servings?: number
  prep_minutes?: number
  cook_minutes?: number
  total_minutes?: number
  ingredients?: IngredientLine[]
  steps?: StepLine[]
  tags?: string[]
}

/** Jedyne miejsce, gdzie surowy wynik warstwy staje się RecipeDraft */
export function buildDraft(raw: RawRecipe, method: ParseMethod): RecipeDraft {
  const prep = raw.prep_minutes
  const cook = raw.cook_minutes
  const total = raw.total_minutes ?? (prep || cook ? (prep ?? 0) + (cook ?? 0) : undefined)
  const description = raw.description ? oneLine(raw.description).slice(0, 600) : undefined

  return {
    title: oneLine(raw.title ?? '').slice(0, 200),
    description: description || undefined,
    image_url: raw.image_url,
    source_url: raw.source_url,
    servings: raw.servings,
    prep_minutes: prep,
    cook_minutes: cook,
    total_minutes: total,
    ingredients: clean((raw.ingredients ?? []).map((i) => ({ ...i, text: normalizeIngredient(i.text) })), 300),
    steps: clean(raw.steps ?? [], 2000),
    tags: raw.tags ?? [],
    parse_method: method,
  }
}

/** Przepis „kompletny” = tytuł + składniki + kroki. Tylko taki kończy pipeline wcześnie. */
export function isComplete(d: RecipeDraft, minIngredients = 1): boolean {
  return d.title.length > 0 && d.ingredients.length >= minIngredients && d.steps.length >= 1
}

export function hasAnyContent(d: RecipeDraft): boolean {
  return d.title.length > 0 && (d.ingredients.length > 0 || d.steps.length > 0)
}

/** Porcje podane wprost w tekście: „PORCJE: 6”, „6 porcji”, „dla 4 osób”, „serves 4” */
export function servingsFromText(text: string): number | undefined {
  const m =
    text.match(/(?:porcj\w*|servings?|serves|yield)\s*[:=-]?\s*(\d{1,2})\b/i) ??
    text.match(/\b(\d{1,2})\s*(?:porcj\w*|servings?)\b/i) ??
    text.match(/\bdla\s+(\d{1,2})\s+os[oó]b/i)
  return m ? parseServings(m[1]) : undefined
}

/** Czas podany z etykietą: „CZAS: 40 MIN”, „Czas przygotowania: 1 h 20 min” */
export function totalMinutesFromText(text: string): number | undefined {
  const m = text.match(
    /\bczas(?:\s+(?:przygotowania|gotowania))?\s*[:=-]?\s*(?:(\d{1,2})\s*h\b)?\s*(?:(\d{1,3})\s*min)?/i,
  )
  if (!m || (!m[1] && !m[2])) return undefined
  const total = Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)
  return total > 0 && total <= 24 * 60 ? total : undefined
}
