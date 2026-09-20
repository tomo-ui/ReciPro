import { describe, expect, it } from 'vitest'
import { INTERESTS_MAX, INTEREST_MAX_LENGTH, SUGGESTED_INTERESTS, normalizeInterest, normalizeInterests } from '../src/lib/interests'

describe('zainteresowania', () => {
  it('normalizeInterest: małe litery, bez #, pojedyncze spacje, do 30 znaków', () => {
    expect(normalizeInterest('  #Kuchnia   Włoska ')).toBe('kuchnia włoska')
    expect(normalizeInterest('   ')).toBeUndefined()
    expect(normalizeInterest('#')).toBeUndefined()
    expect(normalizeInterest('x'.repeat(50))).toHaveLength(INTEREST_MAX_LENGTH)
  })

  it('normalizeInterests: bez powtórzeń (ogonki i wielkość liter bez znaczenia), zachowuje kolejność, limit 30', () => {
    expect(normalizeInterests(['Żurek', 'zurek', ' ', 'Pizza', 'pizza ', '#Deser'])).toEqual(['żurek', 'pizza', 'deser'])
    const many = Array.from({ length: 50 }, (_, i) => `tag${i}`)
    expect(normalizeInterests(many)).toHaveLength(INTERESTS_MAX)
  })

  it('propozycje są poprawne i się nie powtarzają', () => {
    expect(normalizeInterests(SUGGESTED_INTERESTS)).toEqual(SUGGESTED_INTERESTS.map((t) => normalizeInterest(t)))
    expect(SUGGESTED_INTERESTS.every((t) => t.length <= INTEREST_MAX_LENGTH)).toBe(true)
  })
})
