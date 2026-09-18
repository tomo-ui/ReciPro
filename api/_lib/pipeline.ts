import type { ParseOrigin, RecipeDraft } from '../../src/types/recipe.js'
import { fetchHtml, type FetchHtmlOptions } from './fetchHtml.js'
import { extractRecipeFromText, GeminiError, parseWithGemini } from './gemini.js'
import { parseHeuristic } from './heuristic.js'
import { parseJsonLd } from './jsonld.js'
import { hasAnyContent, isComplete } from './normalize.js'
import { fetchTikTokInfo, hashtagsFromCaption, isTikTokUrl, withoutGenericTags } from './tiktok.js'

export type ParseErrorCode =
  | 'no_recipe'
  | 'no_recipe_in_caption'
  | 'ai_failed'
  | 'ai_unavailable'

export class ParseError extends Error {
  constructor(
    public code: ParseErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'ParseError'
  }
}

export interface PipelineOptions {
  geminiApiKey?: string
  geminiModel?: string
  geminiRetryDelayMs?: number
  /** Bezwzględny termin całej operacji (ms od epoki); chroni przed limitem czasu funkcji */
  deadlineAt?: number
  fetchImpl?: typeof fetch
}

export interface ParseOutcome {
  draft: RecipeDraft
  origin: ParseOrigin
}

/**
 * 3 warstwy, pierwsza kompletna (tytuł + składniki + kroki) wygrywa:
 *   1. JSON-LD  →  2. heurystyki HTML  →  3. Gemini.
 * Błąd w warstwie nie przerywa pipeline’u. Jeśli nic nie jest kompletne,
 * zwracamy najlepszy wynik częściowy (użytkownik i tak weryfikuje go w formularzu).
 */
export async function parseRecipeHtml(
  html: string,
  pageUrl: string,
  { geminiApiKey, geminiModel, geminiRetryDelayMs, deadlineAt, fetchImpl }: PipelineOptions = {},
): Promise<RecipeDraft> {
  const partials: RecipeDraft[] = []

  const layers: [string, () => RecipeDraft | null][] = [
    ['json-ld', () => parseJsonLd(html, pageUrl)],
    ['heuristic', () => parseHeuristic(html, pageUrl)],
  ]
  for (const [name, run] of layers) {
    try {
      const draft = run()
      if (draft && isComplete(draft)) return draft
      if (draft && hasAnyContent(draft)) partials.push(draft)
    } catch (e) {
      console.warn(`[parse] warstwa ${name} rzuciła wyjątek:`, e)
    }
  }

  let aiFailed = false
  if (geminiApiKey) {
    try {
      const draft = await parseWithGemini(html, pageUrl, {
        apiKey: geminiApiKey,
        model: geminiModel,
        retryDelayMs: geminiRetryDelayMs,
        deadlineAt,
        fetchImpl,
      })
      if (draft && isComplete(draft)) return draft
      if (draft && hasAnyContent(draft)) partials.push(draft)
    } catch (e) {
      aiFailed = true
      console.error('[parse] Gemini:', e)
    }
  }

  const best = partials.sort(
    (a, b) => b.ingredients.length + b.steps.length - (a.ingredients.length + a.steps.length),
  )[0]
  if (best) return best

  if (aiFailed) throw new ParseError('ai_failed', 'Nie udało się odczytać przepisu — usługa AI jest chwilowo niedostępna.')
  throw new ParseError('no_recipe', 'Nie znalazłem przepisu na tej stronie.')
}

/** Opisy filmów nie mają struktury JSON-LD — do wyciągnięcia przepisu zawsze używamy Gemini */
const MIN_CAPTION_CHARS = 40

/**
 * TikTok: czytamy opis filmu (caption) i wyciągamy z niego przepis.
 * Nie analizujemy samego wideo. Gdy w opisie przepisu nie ma, zgłaszamy to wprost —
 * wyszukiwanie przepisu w sieci na podstawie opisu to osobny, jeszcze niewłączony krok.
 */
export async function parseTikTokCaption(
  url: string,
  { geminiApiKey, geminiModel, geminiRetryDelayMs, deadlineAt, fetchImpl }: PipelineOptions = {},
): Promise<RecipeDraft> {
  const info = await fetchTikTokInfo(url, fetchImpl)

  if (!geminiApiKey) {
    throw new ParseError('ai_unavailable', 'Odczyt opisów z TikToka wymaga skonfigurowanego klucza Gemini na serwerze.')
  }
  if (info.caption.trim().length < MIN_CAPTION_CHARS) {
    throw new ParseError('no_recipe_in_caption', 'Opis tego filmu jest zbyt krótki, żeby zawierał przepis.')
  }

  let draft: RecipeDraft | null
  try {
    const text = `${info.author ? `Author: @${info.author}\n` : ''}Video caption:\n${info.caption}`
    draft = await extractRecipeFromText(
      text,
      { pageUrl: info.canonicalUrl, tags: hashtagsFromCaption(info.caption) },
      { apiKey: geminiApiKey, model: geminiModel, retryDelayMs: geminiRetryDelayMs, deadlineAt, fetchImpl },
    )
  } catch (e) {
    console.error('[parse] Gemini (TikTok):', e instanceof GeminiError ? e.message : e)
    throw new ParseError('ai_failed', 'Nie udało się odczytać opisu — usługa AI jest chwilowo niedostępna.')
  }

  if (!draft || !hasAnyContent(draft)) {
    throw new ParseError(
      'no_recipe_in_caption',
      'W opisie tego filmu nie ma przepisu (np. jest tylko „przepis w komentarzu”). Dodaj go ręcznie albo wklej link do strony z przepisem.',
    )
  }
  return { ...draft, tags: withoutGenericTags(draft.tags) }
}

/** Czas na całą operację — z zapasem względem `maxDuration` funkcji na Vercelu (60 s) */
const TOTAL_BUDGET_MS = 50_000

export async function parseRecipeUrl(
  url: string,
  opts: PipelineOptions & { fetch?: FetchHtmlOptions } = {},
): Promise<ParseOutcome> {
  const options = { ...opts, deadlineAt: opts.deadlineAt ?? Date.now() + TOTAL_BUDGET_MS }

  if (isTikTokUrl(url)) {
    return { draft: await parseTikTokCaption(url, options), origin: 'tiktok-caption' }
  }

  const { html, finalUrl } = await fetchHtml(url, { fetchImpl: opts.fetchImpl, ...opts.fetch })
  return { draft: await parseRecipeHtml(html, finalUrl, options), origin: 'page' }
}
