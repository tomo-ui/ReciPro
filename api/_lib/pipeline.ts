import type { RecipeDraft } from '../../src/types/recipe.js'
import { fetchHtml, type FetchHtmlOptions } from './fetchHtml.js'
import { parseWithGemini } from './gemini.js'
import { parseHeuristic } from './heuristic.js'
import { parseJsonLd } from './jsonld.js'
import { hasAnyContent, isComplete } from './normalize.js'

export type ParseErrorCode = 'no_recipe' | 'ai_failed'

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
  fetchImpl?: typeof fetch
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
  { geminiApiKey, geminiModel, geminiRetryDelayMs, fetchImpl }: PipelineOptions = {},
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

export async function parseRecipeUrl(
  url: string,
  opts: PipelineOptions & { fetch?: FetchHtmlOptions } = {},
): Promise<RecipeDraft> {
  const { html, finalUrl } = await fetchHtml(url, { fetchImpl: opts.fetchImpl, ...opts.fetch })
  return parseRecipeHtml(html, finalUrl, opts)
}
