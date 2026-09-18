import { describe, expect, it } from 'vitest'
import { scaleFactor, scaleIngredient } from '../src/lib/scale'

const s = (text: string, factor: number) => scaleIngredient(text, factor).text

describe('scaleIngredient: wagi i objętości', () => {
  it('gramy i mililitry: zaokrąglenie do sensownej dokładności', () => {
    expect(s('200 g mąki', 1.5)).toBe('300 g mąki')
    expect(s('250 g cukru', 1.5)).toBe('375 g cukru')
    expect(s('250 g cukru', 1.33)).toBe('335 g cukru') // 332,5 → ≥100 → co 5
    expect(s('50 g masła', 0.33)).toBe('17 g masła') // 10–100 → całe
    expect(s('10 g drożdży', 0.5)).toBe('5 g drożdży')
    expect(s('5 g soli', 0.5)).toBe('2,5 g soli')
    expect(s('250 ml mleka', 2)).toBe('500 ml mleka')
  })

  it('przechodzi między jednostkami: g ↔ kg, ml ↔ l', () => {
    expect(s('600 g mąki', 2)).toBe('1,2 kg mąki')
    expect(s('500 g mąki', 4)).toBe('2 kg mąki')
    expect(s('1 kg ziemniaków', 0.5)).toBe('500 g ziemniaków')
    expect(s('1,5 kg mięsa', 0.5)).toBe('750 g mięsa')
    expect(s('500 ml wody', 3)).toBe('1,5 l wody')
    expect(s('1 l bulionu', 0.25)).toBe('250 ml bulionu')
    expect(s('0,5 l mleka', 3)).toBe('1,5 l mleka')
    expect(s('1 kg mąki', 1.25)).toBe('1,25 kg mąki')
  })

  it('bez spacji między liczbą a jednostką i wielkość liter jednostki', () => {
    expect(s('200g mąki', 2)).toBe('400g mąki')
    expect(s('200 G mąki', 2)).toBe('400 G mąki')
  })

  it('dag i dl', () => {
    expect(s('60 dag ziemniaków', 2)).toBe('120 dag ziemniaków')
    expect(s('5 dag sera', 0.5)).toBe('2,5 dag sera')
    expect(s('2 dl mleka', 1.5)).toBe('3 dl mleka')
  })

  it('zakresy: ta sama jednostka dla obu końców, zachowuje zapis', () => {
    expect(s('200-250 g mąki', 2)).toBe('400-500 g mąki')
    expect(s('200–250 g mąki', 2)).toBe('400–500 g mąki')
    expect(s('400 do 600 g mięsa', 2)).toBe('0,8 do 1,2 kg mięsa')
    expect(s('300-400 g mąki', 4)).toBe('1,2-1,6 kg mąki')
  })
})

describe('scaleIngredient: odmiana po polsku', () => {
  it('łyżki i szklanki: ćwiartki i poprawna forma', () => {
    expect(s('1 łyżka oliwy', 2)).toBe('2 łyżki oliwy')
    expect(s('1 łyżka oliwy', 5)).toBe('5 łyżek oliwy')
    expect(s('1 łyżka oliwy', 0.5)).toBe('½ łyżki oliwy')
    expect(s('1 łyżka oliwy', 1.5)).toBe('1½ łyżki oliwy')
    expect(s('2 łyżki cukru', 0.5)).toBe('1 łyżka cukru')
    expect(s('4 łyżki cukru', 3)).toBe('12 łyżek cukru')
    expect(s('2 łyżeczki soli', 2.5)).toBe('5 łyżeczek soli')
    expect(s('1 szklanka mąki', 3)).toBe('3 szklanki mąki')
    expect(s('2 szklanki mleka', 2.5)).toBe('5 szklanek mleka')
    expect(s('1 szklanka mąki', 0.25)).toBe('¼ szklanki mąki')
    expect(s('3 łyżki oleju', 0.75)).toBe('2¼ łyżki oleju')
  })

  it('liczebniki 2–4, 5+ oraz wyjątek 12–14', () => {
    expect(s('1 łyżka', 12)).toBe('12 łyżek')
    expect(s('1 łyżka', 22)).toBe('22 łyżki')
    expect(s('1 łyżka', 14)).toBe('14 łyżek')
    expect(s('1 łyżka', 24)).toBe('24 łyżki')
    expect(s('1 łyżka', 25)).toBe('25 łyżek')
  })

  it('zapis ułamkowy: 1/2, ½, 1½, 2 i 1/2, pół', () => {
    expect(s('1/2 łyżeczki soli', 2)).toBe('1 łyżeczka soli')
    expect(s('½ szklanki cukru', 3)).toBe('1½ szklanki cukru')
    expect(s('1½ szklanki mąki', 2)).toBe('3 szklanki mąki')
    expect(s('2 i 1/2 szklanki mąki', 2)).toBe('5 szklanek mąki')
    expect(s('2 1/2 szklanki mąki', 2)).toBe('5 szklanek mąki')
    expect(s('pół kostki masła', 3)).toBe('1½ kostki masła')
    expect(s('Pół szklanki mleka', 2)).toBe('1 szklanka mleka')
    expect(s('0,5 szklanki mleka', 4)).toBe('2 szklanki mleka')
  })

  it('sztuki: jajka, cebule, ząbki czosnku', () => {
    expect(s('2 jajka', 1.5)).toBe('3 jajka')
    expect(s('2 jajka', 2.5)).toBe('5 jajek')
    expect(s('2 jajka', 0.5)).toBe('1 jajko')
    expect(s('1 jajko', 0.5)).toBe('½ jajka')
    expect(s('1 jajko', 4)).toBe('4 jajka')
    expect(s('1 jajko', 6)).toBe('6 jajek')
    expect(s('3 ząbki czosnku', 2)).toBe('6 ząbków czosnku')
    expect(s('3 ząbki czosnku', 1 / 3)).toBe('1 ząbek czosnku')
    expect(s('1 cebula', 3)).toBe('3 cebule')
    expect(s('1 cebula', 5)).toBe('5 cebul')
    expect(s('1 cebula', 1.5)).toBe('1½ cebuli')
  })

  it('przymiotnik przed rzeczownikiem zgadza się z liczbą i rodzajem', () => {
    expect(s('1 duża cebula', 2)).toBe('2 duże cebule')
    expect(s('1 duża cebula', 5)).toBe('5 dużych cebul')
    expect(s('2 duże cebule', 0.5)).toBe('1 duża cebula')
    expect(s('1 duża cebula', 1.5)).toBe('1½ dużej cebuli')
    expect(s('1 średni pomidor', 3)).toBe('3 średnie pomidory')
    expect(s('3 średnie pomidory', 1 / 3)).toBe('1 średni pomidor')
    expect(s('1 mały ziemniak', 6)).toBe('6 małych ziemniaków')
    expect(s('1 świeże jajko', 3)).toBe('3 świeże jajka')
    expect(s('2 czerwone papryki', 2)).toBe('4 czerwone papryki')
    expect(s('1 czerwona papryka', 5)).toBe('5 czerwonych papryk')
    expect(s('1 Duża cebula', 2)).toBe('2 Duże cebule') // zachowuje wielką literę
  })

  it('opakowania i produkty', () => {
    expect(s('1 puszka pomidorów', 2)).toBe('2 puszki pomidorów')
    expect(s('1 puszka pomidorów (400 g)', 3)).toBe('3 puszki pomidorów (400 g)') // opis opakowania zostaje
    expect(s('1 kostka rosołowa', 6)).toBe('6 kostek rosołowa')
    expect(s('2 plastry sera', 1.5)).toBe('3 plastry sera')
    expect(s('1 liść laurowy', 2)).toBe('2 liście laurowy')
    expect(s('1 opakowanie drożdży', 2)).toBe('2 opakowania drożdży')
    expect(s('1 opakowanie drożdży', 5)).toBe('5 opakowań drożdży')
    expect(s('4 ziemniaki', 2)).toBe('8 ziemniaków')
  })

  it('przedrostki „ok.” i „około”, etykieta przed liczbą', () => {
    expect(s('ok. 200 g mąki', 2)).toBe('ok. 400 g mąki')
    expect(s('około 2 łyżki cukru', 2)).toBe('około 4 łyżki cukru')
    expect(s('mąka pszenna – 200 g', 2)).toBe('mąka pszenna – 400 g')
    expect(s('mleko: 250 ml', 2)).toBe('mleko: 500 ml')
    expect(s('Mąka - 2 szklanki', 2)).toBe('Mąka - 4 szklanki')
  })

  it('zakresy sztuk: odmiana według górnej granicy', () => {
    expect(s('2-3 ząbki czosnku', 2)).toBe('4-6 ząbków czosnku')
    expect(s('1-2 łyżki oleju', 2)).toBe('2-4 łyżki oleju')
  })
})

describe('scaleIngredient: angielski', () => {
  it('cups, tbsp, eggs', () => {
    expect(s('1 cup flour', 2)).toBe('2 cups flour')
    expect(s('2 cups flour', 0.5)).toBe('1 cup flour')
    expect(s('1 cup flour', 0.5)).toBe('½ cup flour')
    expect(s('1 tbsp sugar', 3)).toBe('3 tbsp sugar')
    expect(s('1/2 tsp salt', 2)).toBe('1 tsp salt')
    expect(s('1 egg', 3)).toBe('3 eggs')
    expect(s('3 eggs', 1 / 3)).toBe('1 egg')
    expect(s('2 large eggs', 1.5)).toBe('3 large eggs')
    expect(s('2 large eggs', 0.5)).toBe('1 large egg')
    expect(s('3 cloves garlic', 2)).toBe('6 cloves garlic')
  })
})

describe('scaleIngredient: linie, których nie ruszamy', () => {
  it('bez ilości na początku', () => {
    for (const t of ['szczypta soli', 'sól i pieprz do smaku', 'olej do smażenia', 'natka pietruszki', '']) {
      const r = scaleIngredient(t, 2)
      expect(r.text).toBe(t)
      expect(r.scaled).toBe(false)
    }
  })

  it('współczynnik 1 albo błędny nic nie zmienia', () => {
    expect(scaleIngredient('200 g mąki', 1)).toEqual({ text: '200 g mąki', scaled: false })
    for (const f of [0, -1, NaN, Infinity]) expect(scaleIngredient('200 g mąki', f).scaled).toBe(false)
  })

  it('liczba bez znanej jednostki jest przeliczana, resztę zostawia', () => {
    expect(s('3 rzeczy', 2)).toBe('6 rzeczy')
  })

  it('scaled = true tylko gdy coś przeliczono', () => {
    expect(scaleIngredient('200 g mąki', 2).scaled).toBe(true)
  })
})

describe('scaleFactor', () => {
  it('iloraz nowych i pierwotnych porcji', () => {
    expect(scaleFactor(4, 6)).toBe(1.5)
    expect(scaleFactor(4, 4)).toBe(1)
    expect(scaleFactor(undefined, 4)).toBeNull()
    expect(scaleFactor(0, 4)).toBeNull()
    expect(scaleFactor(4, 0)).toBeNull()
  })
})
