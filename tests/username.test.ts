import { describe, expect, it } from 'vitest'
import { isValidUsername, normalizeFullName, normalizeUsername, validateUsername } from '../src/lib/username'

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
