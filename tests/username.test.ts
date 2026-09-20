import { describe, expect, it } from 'vitest'
import { isValidUsername, normalizeBio, normalizeFullName, normalizeUsername, validateUsername } from '../src/lib/username'
import { formatCount } from '../src/lib/ui'

describe('nazwa użytkownika jak na Instagramie', () => {
  it('akceptuje poprawne nazwy (wielkość liter jest normalizowana)', () => {
    for (const u of ['anna', 'a', '0', 'anna_gotuje', 'anna.k', '_x_', 'a.b.c', 'Kuchnia.Zosi_2026', 'a'.repeat(30), '  anna  ']) {
      expect(validateUsername(u), u).toBeNull()
    }
    expect(normalizeUsername('  Anna.K ')).toBe('anna.k')
  })

  it('odrzuca niepoprawne nazwy z konkretnym komunikatem', () => {
    expect(validateUsername('')).toMatch(/Wpisz/)
    expect(validateUsername('a'.repeat(31))).toMatch(/najwyżej 30/)
    expect(validateUsername('an na')).toMatch(/spacji/)
    expect(validateUsername('anna-k')).toMatch(/Dozwolone/)
    expect(validateUsername('żurek')).toMatch(/Dozwolone/)
    expect(validateUsername('anna!')).toMatch(/Dozwolone/)
    expect(validateUsername('.anna')).toMatch(/od kropki/)
    expect(validateUsername('anna.')).toMatch(/kończyć się kropką/)
    expect(validateUsername('an..na')).toMatch(/dwóch kropek/)
    expect(validateUsername('admin')).toMatch(/zarezerwowana/)
  })

  it('isValidUsername zgadza się z validateUsername', () => {
    expect(isValidUsername('anna')).toBe(true)
    expect(isValidUsername('anna..')).toBe(false)
  })

  it('imię i nazwisko: opcjonalne, czyszczone, do 60 znaków', () => {
    expect(normalizeFullName('   ')).toBeUndefined()
    expect(normalizeFullName('  Jan   Łukasiewicz ')).toBe('Jan Łukasiewicz')
    expect(normalizeFullName('x'.repeat(100))).toHaveLength(60)
  })
})

describe('opis profilu (bio) i liczniki', () => {
  it('normalizeBio: brzegi, spacje, limity 150 znaków i 5 linii', () => {
    expect(normalizeBio('   \n  ')).toBeUndefined()
    expect(normalizeBio('  Gotuję   z pasją \n\n Podlasie  \n')).toBe('Gotuję z pasją\n\nPodlasie')
    expect(normalizeBio('x'.repeat(200))).toHaveLength(150)
    expect(normalizeBio('1\n2\n3\n4\n5\n6\n7')).toBe('1\n2\n3\n4\n5')
  })

  it('formatCount: jak w Instagramie (tys., mln, przecinek)', () => {
    expect(formatCount(0)).toBe('0')
    expect(formatCount(1091)).toBe('1091')
    expect(formatCount(9999)).toBe('9999')
    expect(formatCount(12_500)).toBe('12,5 tys.')
    expect(formatCount(362_000)).toBe('362 tys.')
    expect(formatCount(3_200_000)).toBe('3,2 mln')
  })
})
