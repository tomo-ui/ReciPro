import { parse, type HTMLElement } from 'node-html-parser'
import type { IngredientLine, RecipeDraft, StepLine } from '../../src/types/recipe.js'
import {
  buildDraft,
  cleanPageTitle,
  normalizeTags,
  oneLine,
  parseDurationMinutes,
  parseServings,
  resolveHttpUrl,
  splitLines,
} from './normalize.js'

/**
 * Warstwa 2: heurystyki na HTML, gdy strona nie ma (użytecznego) JSON-LD.
 * Dla każdego pola osobno próbujemy, po kolei:
 *   a) microdata (itemprop=recipeIngredient / recipeInstructions),
 *   b) klasy CSS (…ingredient…, …instructions…, …przygotowanie…),
 *   c) nagłówki tekstowe („Składniki”, „Sposób przygotowania”) + lista/akapity pod nimi.
 */

const INGR_CLASS = /ingredient|sk[lł]adnik/i
const STEP_CLASS = /instruction|direction|recipe-?(?:method|steps?)|preparation|przygotowani|sposob|kroki/i
const INGR_HEAD = /^(sk[łl]adniki|ingredients|potrzebne (?:produkty|sk[łl]adniki)|lista zakup[oó]w)$/i
const STEP_HEAD =
  /^(spos[oó]b (?:przygotowania|wykonania)|przygotowanie|wykonanie|instructions|directions|method|preparation|steps|kroki|jak zrobi[ćc]\b.*)$/i

const MAX_LINES = 80

type Line = { text: string; group?: string }

const tag = (el: HTMLElement) => (el.rawTagName ?? '').toLowerCase()
const headingLevel = (el: HTMLElement) => (/^h[1-6]$/.test(tag(el)) ? Number(tag(el)[1]) : 0)

function meta(root: HTMLElement, key: string): string | undefined {
  const el = root.querySelector(`meta[property="${key}"]`) ?? root.querySelector(`meta[name="${key}"]`)
  return el?.getAttribute('content') || undefined
}

function inClass(el: HTMLElement, re: RegExp, maxDepth = 6): boolean {
  let n: HTMLElement | null = el
  for (let i = 0; n && i <= maxDepth; i++, n = n.parentNode) {
    const t = tag(n)
    if (t === 'body' || t === 'html') return false
    if (re.test(`${n.getAttribute('class') ?? ''} ${n.getAttribute('id') ?? ''}`)) return true
  }
  return false
}

/** Liście listy: pomijamy <li>, które same zawierają zagnieżdżoną listę */
const leafItems = (root: HTMLElement) => root.querySelectorAll('li').filter((li) => !li.querySelector('li'))

const toLines = (els: HTMLElement[]): Line[] =>
  els.map((e) => ({ text: oneLine(e.text) })).filter((l) => l.text.length > 0)

/* — a) microdata — */

function microdata(root: HTMLElement): { ingredients: Line[]; steps: Line[] } {
  const ingredients = toLines(root.querySelectorAll('[itemprop="recipeIngredient"], [itemprop="ingredients"]'))
  const steps: Line[] = []
  for (const el of root.querySelectorAll('[itemprop="recipeInstructions"]')) {
    const items = leafItems(el)
    const parts = items.length ? items : el.querySelectorAll('p')
    if (parts.length) steps.push(...toLines(parts))
    else steps.push(...splitLines(el.structuredText).map((text) => ({ text })))
  }
  return { ingredients, steps }
}

/* — b) klasy CSS — */

function byClass(root: HTMLElement): { ingredients: Line[]; steps: Line[] } {
  const lis = leafItems(root)
  const ingEls = lis.filter((li) => inClass(li, INGR_CLASS))
  const ingSet = new Set(ingEls)

  let stepEls = lis.filter((li) => !ingSet.has(li) && inClass(li, STEP_CLASS))
  if (!stepEls.length) {
    stepEls = root
      .querySelectorAll('p')
      .filter((p) => oneLine(p.text).length >= 20 && inClass(p, STEP_CLASS))
  }
  return { ingredients: toLines(ingEls), steps: toLines(stepEls) }
}

/* — c) nagłówki tekstowe — */

function isBoldOnlyParagraph(el: HTMLElement): boolean {
  return tag(el) === 'p' && el.children.length === 1 && /^(strong|b)$/.test(tag(el.children[0])) &&
    oneLine(el.text).length <= 45
}

/** Element (też opakowanie) będący krótkim nagłówkiem którejś z sekcji: „Składniki”, „Przygotowanie”… */
function isSectionHead(el: HTMLElement): boolean {
  const text = oneLine(el.text).replace(/[:：]\s*$/, '')
  return text.length > 0 && text.length <= 45 && (INGR_HEAD.test(text) || STEP_HEAD.test(text))
}

function collectAfter(start: HTMLElement, kind: 'ingredients' | 'steps'): Line[] {
  // <div><h2>Składniki</h2></div><ul>… — wychodzimy z opakowania, jeśli nie ma rodzeństwa
  let anchor = start
  for (let i = 0; i < 3 && !anchor.nextElementSibling && anchor.parentNode; i++) {
    const t = tag(anchor.parentNode)
    if (t === 'body' || t === 'html' || t === '') break
    anchor = anchor.parentNode
  }

  const startLevel = headingLevel(anchor)
  const out: Line[] = []
  let group: string | undefined

  for (let sib = anchor.nextElementSibling; sib && out.length < MAX_LINES; sib = sib.nextElementSibling) {
    const t = tag(sib)
    const lvl = headingLevel(sib)
    if (lvl) {
      if (startLevel && lvl > startLevel) {
        group = oneLine(sib.text) || undefined // podnagłówek = grupa („Ciasto”, „Sos”)
        continue
      }
      break
    }
    if (isBoldOnlyParagraph(sib) || isSectionHead(sib)) {
      if (out.length) break
      continue
    }
    if (t === 'ul' || t === 'ol') {
      for (const li of leafItems(sib)) out.push({ text: oneLine(li.text), group })
    } else if (t === 'p') {
      const text = oneLine(sib.text)
      if (text.length >= 3 && (kind === 'steps' || text.length <= 200)) out.push({ text, group })
    } else if (t === 'div' || t === 'section') {
      for (const li of leafItems(sib)) out.push({ text: oneLine(li.text), group })
    }
  }
  return out.filter((l) => l.text.length > 0)
}

function byHeadings(root: HTMLElement, head: RegExp, kind: 'ingredients' | 'steps', minLines: number): Line[] {
  const candidates = root
    .querySelectorAll('h1,h2,h3,h4,h5,h6,strong,b,dt,summary,legend,p,span,div')
    .filter((el) => {
      // p/span/div tylko jako „liście” — opakowania z dziećmi łapie ich nagłówek
      if (/^(p|span|div)$/.test(tag(el)) && el.children.length > 0) return false
      const text = oneLine(el.text).replace(/[:：]\s*$/, '')
      return text.length > 0 && text.length <= 45 && head.test(text)
    })
  for (const c of candidates) {
    const lines = collectAfter(c, kind)
    if (lines.length >= minLines) return lines
  }
  return []
}

/* — całość — */

export function parseHeuristic(html: string, pageUrl: string): RecipeDraft | null {
  const root = parse(html)
  const title =
    root.querySelector('h1')?.text ??
    meta(root, 'og:title') ??
    root.querySelector('title')?.text ??
    ''
  const image = meta(root, 'og:image') ?? meta(root, 'twitter:image')
  const description = meta(root, 'og:description') ?? meta(root, 'description')
  const keywords = meta(root, 'keywords')
  const articleTags = root
    .querySelectorAll('meta[property="article:tag"]')
    .map((m) => m.getAttribute('content') ?? '')

  const micro = microdata(root)
  const microTime = (prop: string) => {
    const el = root.querySelector(`[itemprop="${prop}"]`)
    return parseDurationMinutes(el?.getAttribute('datetime') ?? el?.getAttribute('content'))
  }
  const microYield = root.querySelector('[itemprop="recipeYield"]')

  // Selektory poniżej ruszają DOM (remove) — dopiero po microdata i meta
  for (const el of root.querySelectorAll('script,style,noscript,svg,iframe,nav,footer,aside,form')) el.remove()

  const cls = byClass(root)
  let ingredients: Line[] = [micro.ingredients, cls.ingredients].find((l) => l.length >= 2) ?? []
  if (!ingredients.length) ingredients = byHeadings(root, INGR_HEAD, 'ingredients', 2)
  if (ingredients.length < 2) return null

  let steps: Line[] = [micro.steps, cls.steps].find((l) => l.length >= 1) ?? []
  if (!steps.length) steps = byHeadings(root, STEP_HEAD, 'steps', 1)

  const servings =
    parseServings(microYield?.getAttribute('content') ?? microYield?.text) ??
    parseServings(root.text.match(/(?:porcj\w*|serves|servings|yield)\s*:?\s*(\d{1,3})|(\d{1,3})\s*(?:porcj\w*|os[oó]b\w*|servings)/i)?.slice(1).find(Boolean))

  return buildDraft(
    {
      title: cleanPageTitle(title),
      description,
      image_url: resolveHttpUrl(image, pageUrl),
      source_url: pageUrl,
      servings,
      prep_minutes: microTime('prepTime'),
      cook_minutes: microTime('cookTime'),
      total_minutes: microTime('totalTime'),
      ingredients: ingredients as IngredientLine[],
      steps: steps as StepLine[],
      tags: normalizeTags(keywords, articleTags),
    },
    'heuristic',
  )
}
