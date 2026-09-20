import { describe, expect, it } from 'vitest'
import { computeLayout, type LayoutInput } from '../src/lib/viewport'

// iPhone 15 Pro: ekran 393×852
const phone = (over: Partial<LayoutInput> = {}): LayoutInput => ({
  innerWidth: 393,
  innerHeight: 852,
  screenWidth: 393,
  screenHeight: 852,
  vvHeight: 852,
  vvOffsetTop: 0,
  standaloneIPhone: true,
  ...over,
})

describe('układ ekranu na telefonie', () => {
  it('iPhone z ekranu głównego: wymusza pełną wysokość ekranu, także gdy widok jest krótszy o pas gestu', () => {
    expect(computeLayout(phone())).toEqual({ height: 852, top: 0, keyboard: false })
    expect(computeLayout(phone({ innerHeight: 802, vvHeight: 802 }))).toEqual({ height: 852, top: 0, keyboard: false })
  })

  it('obrót: w poziomie używa krótszego wymiaru ekranu', () => {
    const r = computeLayout(phone({ innerWidth: 852, innerHeight: 393, vvHeight: 393 }))
    expect(r).toEqual({ height: 393, top: 0, keyboard: false })
  })

  it('klawiatura: aplikacja kurczy się do widocznej części i podąża za jej przesunięciem', () => {
    const r = computeLayout(phone({ vvHeight: 516, vvOffsetTop: 120 }))
    expect(r).toEqual({ height: 516, top: 120, keyboard: true })
  })

  it('klawiatura w zwykłej przeglądarce (bez trybu aplikacji): też skraca układ', () => {
    const r = computeLayout(phone({ standaloneIPhone: false, innerHeight: 700, vvHeight: 380, vvOffsetTop: 0 }))
    expect(r).toEqual({ height: 380, top: 0, keyboard: true })
  })

  it('małe zmiany (paski przeglądarki) i powiększenie palcami nie są klawiaturą', () => {
    expect(computeLayout(phone({ standaloneIPhone: false, innerHeight: 700, vvHeight: 640 }))).toEqual({ top: 0, keyboard: false })
    expect(computeLayout(phone({ standaloneIPhone: false, innerHeight: 700, vvHeight: 300, vvScale: 2 }))).toEqual({ top: 0, keyboard: false })
  })

  it('bez visualViewport nic nie zmienia poza iPhone’em z ekranu głównego', () => {
    expect(computeLayout(phone({ standaloneIPhone: false, vvHeight: undefined }))).toEqual({ top: 0, keyboard: false })
  })
})
