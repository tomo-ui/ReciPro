import { normalizeIngredient } from './ingredients'
import { emptyDraft, type IngredientLine, type RecipeDraft, type SavedFrom } from '@/types/recipe'

/**
 * Stan formularza przepisu (dodawanie i edycja) i konwersja z/do RecipeDraft.
 * Składniki i kroki to pola tekstowe: jedna linia = jedna pozycja, a linia zaczynająca się od „#”
 * jest nagłówkiem sekcji („# Ciasto”), dzięki czemu grupy z importu nie giną podczas edycji.
 */

export interface FormState {
  title: string
  description: string
  servings: string
  prep: string
  cook: string
  ingredients: string
  steps: string
  tags: string // po przecinku
  source_url?: string
  parse_method: RecipeDraft['parse_method']
  image_url?: string
  /** Produkty z bazy składników wskazane ręcznie: tekst linii → id produktu (patrz IngredientLine.food_id) */
  foodIds?: Record<string, number>
  /** Gdzie przepis trafia: true = post na profilu, false = tylko książka kucharska; brak = starszy przepis (post) */
  is_post?: boolean
  /** Zapisany cudzy przepis: oznaczenie autora oryginału (nie edytujemy, tylko przenosimy) */
  saved_from?: SavedFrom
}

export const emptyForm = (): FormState => ({
  title: '',
  description: '',
  servings: '',
  prep: '',
  cook: '',
  ingredients: '',
  steps: '',
  tags: '',
  parse_method: 'manual',
  is_post: true,
})

/** Pozycje → tekst; zmiana grupy daje linię „# nazwa”, powrót do braku grupy — samo „#” */
export function formatLines(items: IngredientLine[]): string {
  const out: string[] = []
  let current: string | undefined
  for (const item of items) {
    if (item.group !== current) {
      out.push(item.group ? `# ${item.group}` : '#')
      current = item.group
    }
    out.push(item.text)
  }
  return out.join('\n')
}

/** Tekst → pozycje z grupami (puste linie pomijamy) */
export function parseLines(text: string): IngredientLine[] {
  const out: IngredientLine[] = []
  let group: string | undefined
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('#')) {
      group = line.slice(1).trim() || undefined
      continue
    }
    out.push(group ? { text: line, group } : { text: line })
  }
  return out
}

const num = (s: string) => {
  const n = parseInt(s, 10)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

export function draftToForm(d: RecipeDraft): FormState {
  return {
    title: d.title,
    description: d.description ?? '',
    servings: d.servings?.toString() ?? '',
    prep: d.prep_minutes?.toString() ?? '',
    cook: d.cook_minutes?.toString() ?? '',
    ingredients: formatLines(d.ingredients),
    foodIds: Object.fromEntries(d.ingredients.filter((i) => i.food_id !== undefined).map((i) => [i.text, i.food_id as number])),
    steps: formatLines(d.steps),
    tags: d.tags.join(', '),
    source_url: d.source_url,
    image_url: d.image_url,
    parse_method: d.parse_method,
    is_post: d.is_post,
    saved_from: d.saved_from,
  }
}

export function formToDraft(f: FormState): RecipeDraft {
  const prep = num(f.prep)
  const cook = num(f.cook)
  const tags = [...new Set(f.tags.split(',').map((t) => t.trim().replace(/^#/, '').toLowerCase()).filter(Boolean))]
  return {
    ...emptyDraft(),
    title: f.title.trim(),
    description: f.description.trim() || undefined,
    servings: num(f.servings),
    prep_minutes: prep,
    cook_minutes: cook,
    total_minutes: prep || cook ? (prep ?? 0) + (cook ?? 0) : undefined,
    // food_id przypisujemy po surowym tekście linii (przed normalizacją), bo pod takim kluczem trzyma go formularz
    ingredients: parseLines(f.ingredients)
      .map((i) => {
        const foodId = f.foodIds?.[i.text]
        return { ...i, text: normalizeIngredient(i.text), ...(foodId !== undefined ? { food_id: foodId } : {}) }
      })
      .filter((i) => i.text),
    steps: parseLines(f.steps),
    tags: tags.slice(0, 12),
    source_url: f.source_url,
    image_url: f.image_url,
    parse_method: f.parse_method,
    // zapisany cudzy przepis nigdy nie jest postem
    is_post: f.saved_from ? false : f.is_post,
    ...(f.saved_from ? { saved_from: f.saved_from } : {}),
  }
}
