import type { RecipeDraft, StepLine } from '../../src/types/recipe.js'
import {
  buildDraft,
  normalizeTags,
  oneLine,
  parseDurationMinutes,
  parseServings,
  resolveHttpUrl,
  splitLines,
} from './normalize.js'

/** Warstwa 1: schema.org/Recipe z <script type="application/ld+json"> */

const SCRIPT_RE = /<script\b[^>]*\btype\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi

/** Zamienia surowe znaki sterujące wewnątrz stringów JSON na sekwencje ucieczki (zachowuje podziały linii) */
function escapeControlCharsInStrings(text: string): string {
  let out = ''
  let inString = false
  let escaped = false
  for (const ch of text) {
    if (inString && !escaped && ch.charCodeAt(0) < 0x20) {
      out += ch === '\n' ? '\\n' : ch === '\r' ? '' : ch === '\t' ? '\\t' : ' '
      continue
    }
    out += ch
    if (escaped) escaped = false
    else if (ch === '\\') escaped = inString
    else if (ch === '"') inString = !inString
  }
  return out
}

export function extractJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = []
  for (const m of html.matchAll(SCRIPT_RE)) {
    const text = m[1].trim().replace(/^<!\[CDATA\[|\]\]>$/g, '').trim()
    if (!text) continue
    try {
      blocks.push(JSON.parse(text))
    } catch {
      try {
        // Częsty błąd CMS-ów: surowe znaki nowej linii wewnątrz stringów
        blocks.push(JSON.parse(escapeControlCharsInStrings(text)))
      } catch {
        /* uszkodzony blok — pomijamy */
      }
    }
  }
  return blocks
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

function hasType(node: Obj, type: string): boolean {
  const t = node['@type']
  const types = Array.isArray(t) ? t : [t]
  return types.some((x) => typeof x === 'string' && x.split(/[/#]/).pop() === type)
}

function findRecipes(node: unknown, out: Obj[], depth = 0): void {
  if (depth > 6) return
  if (Array.isArray(node)) {
    for (const n of node) findRecipes(n, out, depth + 1)
  } else if (isObj(node)) {
    if (hasType(node, 'Recipe')) out.push(node)
    // @graph, mainEntity, itemListElement… — schodzimy we wszystkie wartości
    for (const v of Object.values(node)) if (typeof v === 'object') findRecipes(v, out, depth + 1)
  }
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined)

function firstImage(v: unknown): string | undefined {
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v.map(firstImage).find(Boolean)
  if (isObj(v)) return str(v.url) ?? str(v.contentUrl)
  return undefined
}

function collectSteps(v: unknown, group: string | undefined, out: StepLine[]): void {
  if (typeof v === 'string') {
    const text = oneLine(v)
    if (text) out.push({ text, group })
  } else if (Array.isArray(v)) {
    for (const x of v) collectSteps(x, group, out)
  } else if (isObj(v)) {
    const nested = v.itemListElement
    if (nested && (hasType(v, 'HowToSection') || !str(v.text))) {
      collectSteps(nested, str(v.name) ? oneLine(str(v.name)!) : group, out)
    } else {
      const text = str(v.text) ?? str(v.name)
      if (text) collectSteps(text, group, out)
    }
  }
}

function parseSteps(v: unknown): StepLine[] {
  // Pojedynczy string bywa wieloliniowy: każda linia to krok
  if (typeof v === 'string') return splitLines(v).map((text) => ({ text }))
  const out: StepLine[] = []
  collectSteps(v, undefined, out)
  return out
}

function parseIngredients(v: unknown): { text: string }[] {
  const items = typeof v === 'string' ? splitLines(v) : Array.isArray(v) ? v : []
  return items.filter((i): i is string => typeof i === 'string').map((text) => ({ text }))
}

export function parseJsonLd(html: string, pageUrl: string): RecipeDraft | null {
  const found: Obj[] = []
  findRecipes(extractJsonLdBlocks(html), found)
  if (!found.length) return null

  const drafts = found.map((r): RecipeDraft => {
    const category = r.recipeCategory
    const cuisine = r.recipeCuisine
    return buildDraft(
      {
        title: str(r.name) ?? str(r.headline),
        description: str(r.description),
        image_url: resolveHttpUrl(firstImage(r.image), pageUrl),
        source_url: pageUrl,
        servings: parseServings(r.recipeYield),
        prep_minutes: parseDurationMinutes(r.prepTime),
        cook_minutes: parseDurationMinutes(r.cookTime),
        total_minutes: parseDurationMinutes(r.totalTime),
        ingredients: parseIngredients(r.recipeIngredient ?? r.ingredients),
        steps: parseSteps(r.recipeInstructions),
        tags: normalizeTags(r.keywords, category, cuisine),
      },
      'json-ld',
    )
  })

  // Strona może mieć kilka Recipe (np. powiązane) — bierzemy najbogatszy
  const score = (d: RecipeDraft) => d.ingredients.length + d.steps.length
  return drafts.sort((a, b) => score(b) - score(a))[0]
}
