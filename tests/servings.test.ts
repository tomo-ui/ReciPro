import { describe, expect, it, vi } from 'vitest'
import { chooseServings, kindFromTitle, servingsFromWeight, totalWeight, PORTION_GRAMS } from '../api/_lib/servings'
import { parseRecipeUrl } from '../api/_lib/pipeline'

const lines = (...t: string[]) => t.map((text) => ({ text }))

describe('rodzaj dania z tytułu', () => {
  it.each([
    ['Zupa pomidorowa', 'soup'],
    ['Żurek na zakwasie', 'soup'],
    ['Sernik na zimno z malinami', 'cake'],
    ['Szarlotka z kruszonką', 'cake'],
    ['Sałatka grecka', 'salad'],
    ['Sos czosnkowy', 'sauce'],
    ['Domowy chleb na zakwasie', 'bread'],
    ['Owsianka z jabłkiem', 'breakfast'],
    ['Smoothie truskawkowe', 'drink'],
  ])('%s → %s', (title, kind) => expect(kindFromTitle(title)).toBe(kind))

  it('bez rozpoznania zwraca undefined, tagi też pomagają', () => {
    expect(kindFromTitle('Kurczak w curry')).toBeUndefined()
    expect(kindFromTitle('Coś pysznego', ['deser'])).toBe('dessert')
  })
})

describe('waga składników', () => {
  it('sumuje gramy, mililitry i sztuki, pomija „do smaku”', () => {
    const w = totalWeight(lines('500 g mąki', '250 ml mleka', '2 jajka', 'sól do smaku'))
    expect(w.withAmount).toBe(3)
    expect(w.weighed).toBe(3)
    expect(w.grams).toBeGreaterThan(850)
    expect(w.grams).toBeLessThan(900)
  })

  it('woda do gotowania nie wlicza się do dania, ale w zupie tak', () => {
    const ing = lines('400 g makaronu', '3 l wody do gotowania', '300 g sera')
    expect(totalWeight(ing, 'main').grams).toBe(700)
    expect(totalWeight(lines('1 kg warzyw', '2 l wody'), 'soup').grams).toBe(3000)
    expect(totalWeight(lines('1 kg warzyw', '2 l wody'), 'main').grams).toBe(1000)
  })

  it('pozycje o nieznanej wadze obniżają pokrycie', () => {
    const w = totalWeight(lines('200 g mąki', '3 kostki czegoś dziwnego', '1 opakowanie proszku'))
    expect(w.withAmount).toBe(3)
    expect(w.weighed).toBe(1)
  })
})

describe('porcje z wagi', () => {
  it('dzieli wagę przez typową wagę porcji i mieści się w 1–24', () => {
    const w = { grams: 1600, weighed: 4, withAmount: 4 }
    expect(servingsFromWeight('main', w)).toBe(4)
    expect(servingsFromWeight('cake', w)).toBe(15)
    expect(servingsFromWeight('sauce', { grams: 5000, weighed: 3, withAmount: 3 })).toBe(24)
    expect(servingsFromWeight('main', { grams: 90, weighed: 1, withAmount: 1 })).toBe(1)
  })

  it('bez rodzaju dania, przy słabym pokryciu albo bez wagi: brak szacunku', () => {
    expect(servingsFromWeight(undefined, { grams: 1600, weighed: 4, withAmount: 4 })).toBeUndefined()
    expect(servingsFromWeight('main', { grams: 1600, weighed: 1, withAmount: 4 })).toBeUndefined()
    expect(servingsFromWeight('main', { grams: 40, weighed: 1, withAmount: 1 })).toBeUndefined()
  })
})

describe('wybór między AI a wagą', () => {
  const weight = { grams: 1200, weighed: 4, withAmount: 4 } // danie główne: 3 porcje

  it('zgodne szacunki: zostaje odpowiedź AI', () => {
    expect(chooseServings({ ai: 4, kind: 'main', weight })?.servings).toBe(4)
  })

  it('rozbieżne szacunki i dobre pokrycie: wygrywa waga, z uzasadnieniem', () => {
    const c = chooseServings({ ai: 12, kind: 'main', weight })!
    expect(c.servings).toBe(3)
    expect(c.basis).toMatch(/1,2 kg składników/)
    expect(c.basis).toMatch(/AI \(12\)/)
  })

  it('rozbieżne szacunki i słabe pokrycie: średnia geometryczna', () => {
    const c = chooseServings({ ai: 12, kind: 'main', weight: { grams: 1200, weighed: 3, withAmount: 4 } })!
    expect(c.servings).toBe(6) // √(12·3)
  })

  it('samo AI albo sama waga; nic — brak wyniku', () => {
    expect(chooseServings({ ai: 5, weight: { grams: 0, weighed: 0, withAmount: 0 } })?.servings).toBe(5)
    expect(chooseServings({ kind: 'cake', weight })?.servings).toBe(Math.round(1200 / PORTION_GRAMS.cake))
    expect(chooseServings({ weight: { grams: 0, weighed: 0, withAmount: 0 } })).toBeUndefined()
  })
})

describe('w imporcie przepisu', () => {
  const page = (name: string, ingredients: string[]) =>
    `<script type="application/ld+json">${JSON.stringify({ '@type': 'Recipe', name, recipeIngredient: ingredients, recipeInstructions: ['zrób'] })}</script>`
  const reply = (body: unknown) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(body) }] } }] }))
  const run = async (html: string, ai?: unknown) => {
    const fetchImpl = vi.fn(async (input: string | URL) =>
      String(input).includes('generativelanguage') ? reply(ai) : new Response(html, { headers: { 'content-type': 'text/html' } }),
    ) as unknown as typeof fetch
    return parseRecipeUrl('http://8.8.8.8/x', { fetchImpl, ...(ai ? { geminiApiKey: 'K', geminiRetryDelayMs: 0 } : {}) })
  }

  it('AI zawyża porcje: liczy się waga składników i użytkownik dostaje uzasadnienie', async () => {
    const out = await run(page('Makaron z kurczakiem', ['400 g makaronu', '400 g piersi z kurczaka', '300 g śmietany', '100 g sera']), { servings: 12, kind: 'main' })
    expect(out.draft.servings).toBe(3) // 1,2 kg / 400 g
    expect(out.servingsEstimated).toBe(true)
    expect(out.servingsBasis).toMatch(/danie główne/)
  })

  it('bez klucza Gemini szacuje z wagi i rodzaju dania z tytułu', async () => {
    const out = await run(page('Sernik', ['1 kg sera', '6 jaj', '200 g cukru', '100 g masła']))
    expect(out.draft.servings).toBe(15) // ok. 1,6 kg / 110 g
    expect(out.servingsEstimated).toBe(true)
  })

  it('bez ilości składników nie zgaduje', async () => {
    const out = await run(page('Sernik', ['ser', 'jajka', 'cukier']))
    expect(out.draft.servings).toBeUndefined()
    expect(out.servingsEstimated).toBe(false)
  })
})
