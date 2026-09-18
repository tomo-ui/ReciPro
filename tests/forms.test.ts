import { describe, expect, it } from 'vitest'
import { draftToForm, formatLines, formToDraft, parseLines } from '../src/lib/recipeForm'
import { storagePathFromUrl } from '../src/lib/images'
import { emptyDraft } from '../src/types/recipe'

describe('sekcje w składnikach i krokach', () => {
  it('format i parsowanie są odwrotne, łącznie z grupami', () => {
    const items = [
      { text: '200 g mąki', group: 'Ciasto' },
      { text: '2 jajka', group: 'Ciasto' },
      { text: '500 g twarogu', group: 'Masa' },
      { text: 'cukier puder' },
    ]
    const text = formatLines(items)
    expect(text).toBe('# Ciasto\n200 g mąki\n2 jajka\n# Masa\n500 g twarogu\n#\ncukier puder')
    expect(parseLines(text)).toEqual(items)
  })

  it('bez grup to zwykła lista; puste linie są pomijane', () => {
    expect(formatLines([{ text: 'a' }, { text: 'b' }])).toBe('a\nb')
    expect(parseLines('\n a \n\n b\n')).toEqual([{ text: 'a' }, { text: 'b' }])
  })
})

describe('formularz ↔ szkic przepisu', () => {
  it('edycja zachowuje wszystkie dane importu', () => {
    const draft = {
      ...emptyDraft(),
      title: 'Sernik',
      description: 'Bez pieczenia',
      servings: 8,
      prep_minutes: 30,
      cook_minutes: 0,
      ingredients: [{ text: '200 g herbatników', group: 'Spód' }, { text: '500 g twarogu', group: 'Masa' }],
      steps: [{ text: 'Zmiksuj.' }, { text: 'Schładzaj.' }],
      tags: ['deser', 'bez pieczenia'],
      source_url: 'https://x.pl/sernik',
      image_url: 'https://cdn/x.jpg',
      parse_method: 'json-ld' as const,
    }
    const back = formToDraft(draftToForm(draft))
    expect(back.ingredients).toEqual(draft.ingredients)
    expect(back.steps).toEqual(draft.steps)
    expect(back.tags).toEqual(draft.tags)
    expect(back.source_url).toBe(draft.source_url)
    expect(back.image_url).toBe(draft.image_url)
    expect(back.parse_method).toBe('json-ld')
    expect(back.servings).toBe(8)
    expect(back.total_minutes).toBe(30)
  })

  it('tagi: małe litery, bez #, bez duplikatów, maks. 12', () => {
    const f = draftToForm(emptyDraft())
    f.tags = '#Obiad, obiad,  Szybkie ,, ' + Array.from({ length: 20 }, (_, i) => `t${i}`).join(',')
    const tags = formToDraft(f).tags
    expect(tags.slice(0, 2)).toEqual(['obiad', 'szybkie'])
    expect(tags).toHaveLength(12)
  })

  it('liczby: tylko dodatnie całkowite', () => {
    const f = draftToForm(emptyDraft())
    f.servings = '0'
    f.prep = 'abc'
    f.cook = '15'
    const d = formToDraft(f)
    expect(d.servings).toBeUndefined()
    expect(d.prep_minutes).toBeUndefined()
    expect(d.cook_minutes).toBe(15)
    expect(d.total_minutes).toBe(15)
  })
})

describe('adresy zdjęć w Storage', () => {
  const base = 'https://abc.supabase.co/storage/v1/object/public/recipe-images'
  it('wyciąga ścieżkę tylko z naszych zdjęć', () => {
    expect(storagePathFromUrl(`${base}/user-1/abc.jpg`)).toBe('user-1/abc.jpg')
    expect(storagePathFromUrl(`${base}/user-1/abc.jpg?t=1`)).toBe('user-1/abc.jpg')
    expect(storagePathFromUrl(`${base}/user-1/a%20b.jpg`)).toBe('user-1/a b.jpg')
    expect(storagePathFromUrl('https://blog.pl/foto.jpg')).toBeNull()
    expect(storagePathFromUrl('data:image/jpeg;base64,AAAA')).toBeNull()
    expect(storagePathFromUrl(undefined)).toBeNull()
    expect(storagePathFromUrl(`${base}/../secret.jpg`)).toBeNull()
  })
})
