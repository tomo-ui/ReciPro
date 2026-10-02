import { describe, expect, it, vi } from 'vitest'
import { cleanImages, cleanPastedText, MAX_IMAGES, MAX_PASTED_CHARS, MIN_PASTED_CHARS } from '../api/_lib/inputs'
import { ParseError, parseRecipeImages, parseRecipeText } from '../api/_lib/pipeline'

const reply = (body: unknown) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(body) }] } }] }), { status: 200 })

const recipe = {
  is_recipe: true,
  title: 'Naleśniki',
  servings: 4,
  ingredients: [{ text: '250 g mąki' }, { text: '500 ml mleka' }, { text: '2 jajka' }],
  steps: [{ text: 'Wymieszaj składniki.' }, { text: 'Smaż na patelni.' }],
}

const sentBody = (fetchImpl: ReturnType<typeof vi.fn>) => JSON.parse((fetchImpl.mock.calls[0] as [string, RequestInit])[1].body as string)

describe('cleanPastedText', () => {
  it('przycina i normalizuje, odrzuca za krótki tekst i nie-tekst', () => {
    expect(cleanPastedText('  Składniki:\r\n- mąka\r\nPrzygotowanie: wymieszaj wszystko dokładnie  ')).toBe(
      'Składniki:\n- mąka\nPrzygotowanie: wymieszaj wszystko dokładnie',
    )
    expect(cleanPastedText('za krótki')).toBeNull()
    expect(cleanPastedText('x'.repeat(MIN_PASTED_CHARS - 1))).toBeNull()
    expect(cleanPastedText(123)).toBeNull()
    expect(cleanPastedText('a'.repeat(MAX_PASTED_CHARS + 500))).toHaveLength(MAX_PASTED_CHARS)
  })
})

describe('cleanImages', () => {
  const ok = { mimeType: 'image/jpeg', data: 'QUJD' }

  it('przepuszcza poprawne zdjęcia', () => {
    expect(cleanImages([ok, { mimeType: 'image/png', data: 'QUJDRA==' }])).toHaveLength(2)
  })

  it('odrzuca zły format, brak zdjęć, za dużo zdjęć i nie-base64', () => {
    expect(cleanImages([])).toBeNull()
    expect(cleanImages('nie tablica')).toBeNull()
    expect(cleanImages(Array(MAX_IMAGES + 1).fill(ok))).toBeNull()
    expect(cleanImages([{ mimeType: 'image/gif', data: 'QUJD' }])).toBeNull()
    expect(cleanImages([{ mimeType: 'text/html', data: 'QUJD' }])).toBeNull()
    expect(cleanImages([{ mimeType: 'image/jpeg', data: 'to nie base64 <script>' }])).toBeNull()
    expect(cleanImages([{ mimeType: 'image/jpeg', data: '' }])).toBeNull()
    expect(cleanImages([null])).toBeNull()
  })

  it('odrzuca zbyt duże zdjęcie i zbyt duży komplet', () => {
    expect(cleanImages([{ mimeType: 'image/jpeg', data: 'A'.repeat(1_500_001) }])).toBeNull()
    expect(cleanImages(Array(3).fill({ mimeType: 'image/jpeg', data: 'A'.repeat(1_400_000) }))).toBeNull()
  })
})

describe('parseRecipeText (wklejony tekst)', () => {
  it('wysyła sam tekst (bez adresu źródła) i zwraca przepis bez source_url', async () => {
    const fetchImpl = vi.fn(async () => reply(recipe))
    const out = await parseRecipeText('Naleśniki: 250 g mąki, 500 ml mleka, 2 jajka. Wymieszaj i smaż.', { geminiApiKey: 'k', fetchImpl })
    expect(out.origin).toBe('text')
    expect(out.draft.title).toBe('Naleśniki')
    expect(out.draft.source_url).toBeUndefined()
    expect(out.draft.ingredients).toHaveLength(3)
    expect(out.draft.steps).toHaveLength(2)

    const body = sentBody(fetchImpl)
    const userText = body.contents[0].parts[0].text as string
    expect(userText).toContain('Naleśniki: 250 g mąki')
    expect(userText).not.toContain('Source URL')
    expect(body.contents[0].parts).toHaveLength(1) // sam tekst, bez obrazów
  })

  it('dopisuje porcje i czas podane w tekście, gdy model ich nie odczytał', async () => {
    const fetchImpl = vi.fn(async () => reply({ ...recipe, servings: undefined }))
    const out = await parseRecipeText('PORCJE: 6\nCZAS: 40 MIN\n250 g mąki, 500 ml mleka\nWymieszaj i smaż na patelni', { geminiApiKey: 'k', fetchImpl })
    expect(out.draft.servings).toBe(6)
    expect(out.draft.total_minutes).toBe(40)
    expect(out.servingsEstimated).toBe(false)
  })

  it('model nie widzi przepisu → no_recipe; brak klucza → ai_unavailable', async () => {
    const none = vi.fn(async () => reply({ is_recipe: false, title: '', ingredients: [], steps: [] }))
    await expect(parseRecipeText('Dzisiaj była ładna pogoda i długi spacer po parku.', { geminiApiKey: 'k', fetchImpl: none })).rejects.toMatchObject({ code: 'no_recipe' })
    await expect(parseRecipeText('tekst bez znaczenia tutaj, ale dość długi', {})).rejects.toMatchObject({ code: 'ai_unavailable' })
  })

  it('awaria AI to ParseError ai_failed z czytelnym komunikatem', async () => {
    const down = vi.fn(async () => new Response('x', { status: 403 }))
    const err = await parseRecipeText('Składniki: mąka, mleko, jajka. Przygotowanie: wymieszać.', { geminiApiKey: 'k', fetchImpl: down }).catch((e) => e)
    expect(err).toBeInstanceOf(ParseError)
    expect(err.code).toBe('ai_failed')
  })
})

describe('parseRecipeImages (zrzuty ekranu)', () => {
  const images = [
    { mimeType: 'image/jpeg', data: 'AAAA' },
    { mimeType: 'image/png', data: 'BBBB' },
  ]

  it('dołącza obrazy jako inlineData i prosi o odczyt tekstu z obrazów', async () => {
    const fetchImpl = vi.fn(async () => reply(recipe))
    const out = await parseRecipeImages(images, { geminiApiKey: 'k', fetchImpl })
    expect(out.origin).toBe('image')
    expect(out.draft.source_url).toBeUndefined()
    expect(out.draft.parse_method).toBe('gemini')

    const body = sentBody(fetchImpl)
    const parts = body.contents[0].parts
    expect(parts).toHaveLength(3)
    expect(parts[1]).toEqual({ inlineData: { mimeType: 'image/jpeg', data: 'AAAA' } })
    expect(parts[2]).toEqual({ inlineData: { mimeType: 'image/png', data: 'BBBB' } })
    expect(body.systemInstruction.parts[0].text).toContain('IMAGES')
  })

  it('na zdjęciach nie ma przepisu → no_recipe', async () => {
    const none = vi.fn(async () => reply({ is_recipe: false, title: '', ingredients: [], steps: [] }))
    await expect(parseRecipeImages(images, { geminiApiKey: 'k', fetchImpl: none })).rejects.toMatchObject({ code: 'no_recipe' })
  })
})
