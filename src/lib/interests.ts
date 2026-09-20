import { fold } from './text'

/** Limity zgodne z supabase/engagement.sql (public.interests_valid) */
export const INTERESTS_MAX = 30
export const INTEREST_MAX_LENGTH = 30

/** Jedno zainteresowanie: bez „#”, małe litery, pojedyncze spacje; puste → undefined */
export function normalizeInterest(raw: string): string | undefined {
  const t = raw.replace(/#/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, INTEREST_MAX_LENGTH).trim()
  return t || undefined
}

/** Lista bez pustych i powtórzeń (wielkość liter i ogonki bez znaczenia), najwyżej 30 pozycji */
export function normalizeInterests(list: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of list) {
    const t = normalizeInterest(raw)
    if (!t) continue
    const key = fold(t)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
    if (out.length >= INTERESTS_MAX) break
  }
  return out
}

/** Propozycje do wyboru jednym dotknięciem (obok najpopularniejszych tagów z bazy) */
export const SUGGESTED_INTERESTS = [
  'śniadanie', 'obiad', 'kolacja', 'zupa', 'sałatka', 'przekąska', 'deser', 'ciasto',
  'szybkie', 'fit', 'wegetariańskie', 'wegańskie', 'bezglutenowe', 'bez pieczenia',
  'makaron', 'pizza', 'ryby', 'mięso', 'drób', 'grill',
  'kuchnia polska', 'kuchnia włoska', 'kuchnia azjatycka', 'kuchnia meksykańska',
  'pieczenie', 'słodkie', 'ostre', 'tradycyjne', 'na imprezę', 'jednogarnkowe',
]
