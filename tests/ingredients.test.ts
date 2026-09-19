import { describe, expect, it } from 'vitest'
import { normalizeIngredient as n } from '../src/lib/ingredients'

describe('ilość na początku linii', () => {
  it.each([
    ['Mąka pszenna – 200 g', '200 g mąka pszenna'],
    ['Mąka pszenna: 200 g', '200 g mąka pszenna'],
    ['Mąka pszenna - 200 g', '200 g mąka pszenna'],
    ['Mąka pszenna 200 g', '200 g mąka pszenna'],
    ['Mąka pszenna (200 g)', '200 g mąka pszenna'],
    ['Woda 1 l', '1 l woda'],
    ['Jajka – 3 szt.', '3 jajka'],
    ['Jajka: 2', '2 jajka'],
    ['200g mąki', '200 g mąki'],
    ['- 200 g mąki', '200 g mąki'],
    ['około 200 g mąki', '200 g mąki'],
    ['Mąka typ 450 – 200 g', '200 g mąka typ 450'],
  ])('%s → %s', (input, expected) => expect(n(input)).toBe(expected))
})

describe('waga metryczna zamiast ułamków i miar domowych', () => {
  it.each([
    ['1/2 kg mięsa', '500 g mięsa'],
    ['0,5 kg mięsa', '500 g mięsa'],
    ['1,5 kg ziemniaków', '1,5 kg ziemniaków'],
    ['20 dag sera', '200 g sera'],
    ['½ l mleka', '500 ml mleka'],
    ['pół szklanki mąki', '70 g mąki'],
    ['1 szklanka mąki pszennej', '140 g mąki pszennej'],
    ['1 szklanka cukru', '200 g cukru'],
    ['1/2 szklanki mleka', '125 ml mleka'],
    ['2 łyżki oliwy z oliwek', '30 ml oliwy z oliwek'],
    ['łyżeczka soli', '6 g soli'],
    ['1 łyżeczka kuminu', '2 g kuminu'],
    ['2 czubate łyżki cukru', '25 g cukru'],
    ['2-3 łyżki masła', '30-45 g masła'],
    ['1 1/2 szklanki wody', '375 ml wody'],
    ['1 szklanka (250 ml) mleka', '250 ml mleka'],
    ['1 szklanka mleka (250 ml)', '250 ml mleka'],
    ['1 szklanka (130 g) mąki', '130 g mąki'],
    ['200 g (1 szklanka) cukru', '200 g cukru'],
    ['Cukier – 1 szklanka', '200 g cukier'],
    ['1/2 kostki masła', '100 g masła'],
    ['1/2 cebuli', '50 g cebuli'],
    ['1 1/2 cebuli', '150 g cebuli'],
    ['½ cytryny', '50 g cytryny'],
    ['1/2 pęczka pietruszki', '0,5 pęczka pietruszki'],
    ['1 cup flour', '140 g flour'],
  ])('%s → %s', (input, expected) => expect(n(input)).toBe(expected))
})

describe('zostaje bez zmian', () => {
  it.each([
    '200 g mąki',
    '2 jajka',
    '3 ząbki czosnku',
    '2-3 gałązki tymianku',
    '1 puszka pomidorów',
    'sól i pieprz do smaku',
    'Sól do smaku',
    '2 duże cebule',
    '',
  ])('%s', (input) => expect(n(input)).toBe(input))

  it('szczypta i garść dostają liczbę na początku', () => {
    expect(n('szczypta soli')).toBe('1 szczypta soli')
    expect(n('garść orzechów')).toBe('1 garść orzechów')
  })
})

describe('idempotencja', () => {
  it.each([
    'Mąka – 1 szklanka',
    '1/2 szklanki mleka',
    'pół szklanki mąki',
    '2-3 łyżki masła',
    '1/2 cebuli',
    '0,5 kg mięsa',
    'Jajka – 3 szt.',
    '1/2 pęczka pietruszki',
    'łyżeczka soli',
  ])('%s', (input) => {
    const once = n(input)
    expect(n(once)).toBe(once)
  })
})

describe('współpraca z kalkulatorem porcji', () => {
  it('znormalizowane linie da się przeliczać', async () => {
    const { scaleIngredient } = await import('../src/lib/scale')
    expect(scaleIngredient(n('pół szklanki mąki'), 2).text).toBe('140 g mąki')
    expect(scaleIngredient(n('Mąka – 300 g'), 2).text).toBe('600 g mąka')
    expect(scaleIngredient(n('2-3 łyżki masła'), 2).text).toMatch(/^60.90 g masła$/)
    expect(scaleIngredient(n('1/2 cebuli'), 3).text).toBe('150 g cebuli')
  })
})

describe('miejsca zapisu', () => {
  it('import (buildDraft) i formularz (formToDraft) normalizują składniki, kroki zostają', async () => {
    const { buildDraft } = await import('../api/_lib/normalize')
    const draft = buildDraft(
      { title: 'T', ingredients: [{ text: 'Mąka – 1 szklanka', group: 'Ciasto' }, { text: 'sól do smaku' }], steps: [{ text: '1/2 szklanki wody dodaj' }] },
      'json-ld',
    )
    expect(draft.ingredients).toEqual([{ text: '140 g mąka', group: 'Ciasto' }, { text: 'sól do smaku' }])
    expect(draft.steps[0].text).toBe('1/2 szklanki wody dodaj')

    const { emptyForm, formToDraft } = await import('../src/lib/recipeForm')
    const form = { ...emptyForm(), title: 'X', ingredients: '# Sos\npół szklanki mleka\nJajka: 2\n\n', steps: '1/2 szklanki' }
    const d = formToDraft(form)
    expect(d.ingredients).toEqual([{ text: '125 ml mleka', group: 'Sos' }, { text: '2 jajka', group: 'Sos' }])
    expect(d.steps[0].text).toBe('1/2 szklanki')
  })
})
