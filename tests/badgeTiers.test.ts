import { describe, expect, it } from 'vitest'
import { BADGE_TIERS, type VerifiedBadgeTier } from '../src/lib/badgeTiers'

describe('klasy znaczków weryfikacji', () => {
  const tiers = Object.keys(BADGE_TIERS) as VerifiedBadgeTier[]

  it('każda klasa ma kolor, etykietę, nazwę klasy i opis (panel na profilu niczego nie pominie)', () => {
    expect(tiers.sort()).toEqual(['blue', 'gold', 'pink', 'purple'])
    for (const t of tiers) {
      const info = BADGE_TIERS[t]
      expect(info.color, t).toMatch(/^#[0-9a-f]{6}$/i)
      expect(info.label.length, t).toBeGreaterThan(3)
      expect(info.className.length, t).toBeGreaterThan(3)
      expect(info.description.length, t).toBeGreaterThan(10)
    }
  })

  it('nazwy klas i kolory nie powtarzają się', () => {
    expect(new Set(tiers.map((t) => BADGE_TIERS[t].className)).size).toBe(tiers.length)
    expect(new Set(tiers.map((t) => BADGE_TIERS[t].color)).size).toBe(tiers.length)
  })
})
