import { describe, expect, it } from 'vitest'
import { spreadAuthors } from '../src/lib/feedOrder'

const by = (s: string) => s.split('').map((a, i) => ({ a, i }))
const run = (input: string, previous?: string) =>
  spreadAuthors(by(input), (x) => x.a, previous)
    .map((x) => x.a)
    .join('')

describe('rozpraszanie autorów w feedzie', () => {
  it('nie zmienia kolejności, gdy nikt się nie powtarza', () => {
    expect(run('abcd')).toBe('abcd')
  })

  it('przepis tego samego autora nie idzie zaraz po jego poprzednim', () => {
    expect(run('aabbc')).toBe('ababc')
    expect(run('aaabcd')).toBe('abacad')
  })

  it('granica stron: pierwszy przepis nowej strony różni się od ostatniego wyświetlonego', () => {
    expect(run('aab', 'a')).toBe('baa') // b przesunięte na początek; reszta zostaje jak była
    expect(run('bac', 'b')).toBe('abc')
  })

  it('gdy się nie da (sami ci sami autorzy), zostawia kolejność wejściową i niczego nie gubi', () => {
    expect(run('aaa')).toBe('aaa')
    const items = by('aabbaacc')
    const out = spreadAuthors(items, (x) => x.a)
    expect([...out].sort((p, q) => p.i - q.i)).toEqual(items) // te same elementy
    expect(out.slice(1).every((x, k) => x.a !== out[k].a)).toBe(true)
  })

  it('elementy bez autora nigdy nie blokują ani nie są uznawane za powtórkę', () => {
    const out = spreadAuthors([{ a: undefined }, { a: undefined }, { a: 'x' }], (x) => x.a)
    expect(out).toHaveLength(3)
  })

  it('pusta lista', () => {
    expect(run('')).toBe('')
  })
})
