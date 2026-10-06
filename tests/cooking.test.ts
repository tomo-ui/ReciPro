import { describe, expect, it } from 'vitest'
import { findTimers, formatClock } from '../src/lib/cooking'

describe('findTimers (czasy w krokach przepisu)', () => {
  const secs = (text: string) => findTimers(text).map((t) => t.seconds)

  it('minuty, także z odmianą i kropką', () => {
    expect(secs('Smaż po 3 minuty z każdej strony.')).toEqual([180])
    expect(secs('Gotuj 10 minut.')).toEqual([600])
    expect(secs('Piecz 45 min.')).toEqual([2700])
    expect(secs('Odstaw na 1 minutę.')).toEqual([60])
    expect(secs('Zagotuj, 20 min. gotuj na małym ogniu')).toEqual([1200])
  })

  it('zakresy: bierzemy dolną granicę', () => {
    expect(secs('Smaż 3-4 minuty')).toEqual([180])
    expect(secs('Piecz 45–50 minut')).toEqual([2700])
    expect(secs('Gotuj od 5 do 7 minut')).toEqual([300])
  })

  it('godziny (także ułamkowe) i „pół godziny”', () => {
    expect(secs('Piecz 1,5 godziny.')).toEqual([5400])
    expect(secs('Wyrastaj 2 godz.')).toEqual([7200])
    expect(secs('Chłodź 1 h')).toEqual([3600])
    expect(secs('Gotuj pół godziny')).toEqual([1800])
    expect(secs('Marynuj przez godzinę')).toEqual([3600])
  })

  it('sekundy; zbyt krótkie i absurdalnie długie czasy są pomijane', () => {
    expect(secs('Podgrzewaj 30 sekund')).toEqual([30])
    expect(secs('Mieszaj 2 sek.')).toEqual([])
    expect(secs('Dojrzewa 40 godzin')).toEqual([])
  })

  it('kilka czasów w jednym kroku: w kolejności w tekście, bez powtórzeń tego samego czasu', () => {
    expect(secs('Smaż 3 minuty, odwróć i smaż jeszcze 2 minuty, potem odstaw na 10 minut.')).toEqual([180, 120, 600])
    expect(secs('Smaż 3 minuty. Po 3 minutach odwróć.')).toEqual([180])
  })

  it('nie myli słów i liczb, które nie są czasem', () => {
    expect(secs('Dodaj 200 g mąki i 2 jajka.')).toEqual([])
    expect(secs('Podawaj z minimalną ilością soli')).toEqual([])
    expect(secs('Piekarnik rozgrzej do 180 stopni.')).toEqual([])
    expect(secs('Mieszaj aż składniki się połączą')).toEqual([])
  })

  it('etykieta to fragment tekstu, z którego odczytano czas', () => {
    expect(findTimers('Smaż 3-4 minuty z każdej strony')[0].label).toBe('3-4 minuty')
    expect(findTimers('Gotuj pół godziny')[0].label).toBe('pół godziny')
  })
})

describe('formatClock', () => {
  it('formatuje czas do zegara', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(5)).toBe('0:05')
    expect(formatClock(125)).toBe('2:05')
    expect(formatClock(600)).toBe('10:00')
    expect(formatClock(3725)).toBe('1:02:05')
    expect(formatClock(-3)).toBe('0:00')
    expect(formatClock(59.2)).toBe('1:00') // zaokrąglamy w górę, zegar nie pokazuje 0:00 przed końcem
  })
})
