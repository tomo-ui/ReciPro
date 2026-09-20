import type { ParseOrigin, RecipeDraft, ThumbnailInfo } from '../../src/types/recipe.js'
import { fetchHtml, type FetchHtmlOptions } from './fetchHtml.js'
import { estimateDish, extractRecipeFromText, GeminiError, parseWithGemini } from './gemini.js'
import { chooseServings, kindFromTitle, totalWeight, type DishKind } from './servings.js'
import { parseHeuristic } from './heuristic.js'
import { parseJsonLd } from './jsonld.js'
import { hasAnyContent, isComplete, servingsFromText, totalMinutesFromText } from './normalize.js'
import { downloadTikTokThumbnail, prepareCover, uploadRecipeImage, type StorageConfig } from './image.js'
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
  /** Dane do zapisu miniaturek w Supabase Storage (jako zalogowany użytkownik). Brak = tryb lokalny. */
  storage?: StorageConfig
  fetchImpl?: typeof fetch
}

export interface ParseOutcome {
  draft: RecipeDraft
  origin: ParseOrigin
  /** Liczbę porcji oszacowało AI (w źródle jej nie było) */
  servingsEstimated: boolean
  /** Skąd wzięła się liczba porcji, np. „ok. 1,6 kg składników; danie główne to zwykle ok. 400 g na porcję” */
  servingsBasis?: string
  /** Wynik zapisu miniaturki filmu (dla stron WWW zawsze status „none”) */
  thumbnail: ThumbnailInfo
}

/** Czytelny dla użytkownika powód, dla którego AI nie odpowiedziało */
export function aiFailureMessage(e: unknown): string {
  const status = e instanceof GeminiError ? e.status : undefined
  const text = e instanceof Error ? e.message : ''
  if (status === 429) return 'Limit zapytań do AI został chwilowo wyczerpany. Spróbuj ponownie za minutę.'
  if (status !== undefined && status >= 500) return 'Usługa AI jest teraz przeciążona. Spróbuj ponownie za chwilę.'
  if (/limit czasu|timeout|aborted/i.test(text)) return 'AI nie odpowiedziało na czas. Spróbuj ponownie.'
  return 'Nie udało się odczytać przepisu — usługa AI jest chwilowo niedostępna.'
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
  let aiError: unknown
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
      aiError = e
      console.error('[parse] Gemini:', e)
    }
  }

  const best = partials.sort(
    (a, b) => b.ingredients.length + b.steps.length - (a.ingredients.length + a.steps.length),
  )[0]
  if (best) return best

  if (aiFailed) throw new ParseError('ai_failed', aiFailureMessage(aiError))
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
  { geminiApiKey, geminiModel, geminiRetryDelayMs, deadlineAt, storage, fetchImpl }: PipelineOptions = {},
): Promise<{ draft: RecipeDraft; thumbnail: ThumbnailInfo }> {
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
      {
        pageUrl: info.canonicalUrl,
        tags: hashtagsFromCaption(info.caption),
        // W opisach rzadko jest tytuł; pusty tytuł nie może oznaczać „brak przepisu”
        fallbackTitle: info.author ? `Przepis z TikToka (@${info.author})` : 'Przepis z TikToka',
      },
      { apiKey: geminiApiKey, model: geminiModel, retryDelayMs: geminiRetryDelayMs, deadlineAt, fetchImpl },
    )
  } catch (e) {
    console.error('[parse] Gemini (TikTok):', e instanceof GeminiError ? e.message : e)
    throw new ParseError('ai_failed', aiFailureMessage(e))
  }

  if (!draft || !hasAnyContent(draft)) {
    throw new ParseError(
      'no_recipe_in_caption',
      'W opisie tego filmu nie ma przepisu (np. jest tylko „przepis w komentarzu”). Dodaj go ręcznie albo wklej link do strony z przepisem.',
    )
  }
  // Miniaturka dopiero po znalezieniu przepisu, żeby nie zostawiać w Storage obrazów bez przepisu
  const { image_url, thumbnail } = await persistThumbnail(info.thumbnailUrl, { storage, deadlineAt, fetchImpl })

  // Siatka bezpieczeństwa: dane podane wprost w opisie („PORCJE: 6”, „CZAS: 40 MIN”) mają pierwszeństwo
  // przed szacunkiem AI, nawet jeśli model ich nie odczytał
  const total = draft.total_minutes ?? (draft.prep_minutes || draft.cook_minutes ? undefined : totalMinutesFromText(info.caption))
  return {
    draft: {
      ...draft,
      servings: draft.servings ?? servingsFromText(info.caption),
      total_minutes: total,
      image_url,
      tags: withoutGenericTags(draft.tags),
    },
    thumbnail,
  }
}

/**
 * Pobiera miniaturkę filmu, kadruje ją do okładki 4:3 i zapisuje w Supabase Storage.
 * Nigdy nie rzuca — porażka daje status „failed” z powodem, a import przepisu trwa dalej.
 */
async function persistThumbnail(
  thumbnailUrl: string | undefined,
  { storage, deadlineAt, fetchImpl }: Pick<PipelineOptions, 'storage' | 'deadlineAt' | 'fetchImpl'>,
): Promise<{ image_url?: string; thumbnail: ThumbnailInfo }> {
  if (!thumbnailUrl) return { thumbnail: { status: 'none' } }
  if (!storage) {
    // Tryb lokalny bez Supabase: adres tymczasowy (ok. 48 h) — dane i tak żyją tylko w przeglądarce
    return { image_url: thumbnailUrl, thumbnail: { status: 'temporary' } }
  }

  const fail = (reason: string) => {
    console.warn('[parse] miniaturka TikToka:', reason)
    return { thumbnail: { status: 'failed' as const, reason } }
  }
  if (deadlineAt !== undefined && deadlineAt - Date.now() < 6000) return fail('za mało czasu na pobranie miniaturki')

  const { image, reason } = await downloadTikTokThumbnail(thumbnailUrl, fetchImpl)
  if (!image) return fail(reason ?? 'nie udało się pobrać miniaturki')

  try {
    const image_url = await uploadRecipeImage(prepareCover(image), storage, fetchImpl)
    return { image_url, thumbnail: { status: 'saved' } }
  } catch (e) {
    return fail(`zapis w Storage: ${e instanceof Error ? e.message : String(e)}`.slice(0, 160))
  }
}

/**
 * Gdy źródło nie podaje liczby porcji, szacujemy ją z wagi składników i rodzaju dania, a odpowiedź AI
 * (jeśli jest) służy do porównania (patrz servings.ts). Błąd AI lub brak czasu nie psuje importu.
 */
async function withEstimatedServings(
  draft: RecipeDraft,
  { geminiApiKey, geminiModel, geminiRetryDelayMs, deadlineAt, fetchImpl }: PipelineOptions,
): Promise<{ draft: RecipeDraft; estimated: boolean; basis?: string }> {
  if (draft.servings || draft.ingredients.length < 2) return { draft, estimated: false }

  let ai: { servings?: number; kind?: DishKind } = {}
  if (geminiApiKey && (deadlineAt === undefined || deadlineAt - Date.now() >= 6000)) {
    try {
      ai = await estimateDish(draft, { apiKey: geminiApiKey, model: geminiModel, retryDelayMs: geminiRetryDelayMs, deadlineAt, fetchImpl })
    } catch (e) {
      console.warn('[parse] szacowanie porcji:', e instanceof Error ? e.message : e)
    }
  }
  const kind = ai.kind ?? kindFromTitle(draft.title, draft.tags)
  const choice = chooseServings({ ai: ai.servings, kind, weight: totalWeight(draft.ingredients, kind) })
  if (choice) return { draft: { ...draft, servings: choice.servings }, estimated: true, basis: choice.basis }
  return { draft, estimated: false }
}

/** Czas na całą operację — z zapasem względem `maxDuration` funkcji na Vercelu (60 s) */
const TOTAL_BUDGET_MS = 50_000

export async function parseRecipeUrl(
  url: string,
  opts: PipelineOptions & { fetch?: FetchHtmlOptions } = {},
): Promise<ParseOutcome> {
  const options = { ...opts, deadlineAt: opts.deadlineAt ?? Date.now() + TOTAL_BUDGET_MS }

  if (isTikTokUrl(url)) {
    const { draft, thumbnail } = await parseTikTokCaption(url, options)
    const withServings = await withEstimatedServings(draft, options)
    return { draft: withServings.draft, origin: 'tiktok-caption', servingsEstimated: withServings.estimated, servingsBasis: withServings.basis, thumbnail }
  }

  const { html, finalUrl } = await fetchHtml(url, { fetchImpl: opts.fetchImpl, ...opts.fetch })
  const withServings = await withEstimatedServings(await parseRecipeHtml(html, finalUrl, options), options)
  return {
    draft: withServings.draft,
    origin: 'page',
    servingsEstimated: withServings.estimated,
    servingsBasis: withServings.basis,
    thumbnail: { status: 'none' },
  }
}
