import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { computeLayout, revealDelta, type LayoutInput } from '../src/lib/viewport'

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

describe('wyrównanie pola nad klawiaturą', () => {
  const area = { top: 0, bottom: 500 }

  it('pole już widoczne (z marginesem) nie jest ruszane', () => {
    expect(revealDelta({ top: 200, bottom: 250 }, area)).toBe(0)
    expect(revealDelta({ top: 20, bottom: 70 }, area)).toBe(0)
    expect(revealDelta({ top: 430, bottom: 480 }, area)).toBe(0)
  })

  it('pole tuż przy dolnej krawędzi lub pod klawiaturą trafia na środek obszaru', () => {
    expect(revealDelta({ top: 460, bottom: 510 }, area)).toBe(235) // środek pola 485 → 250
    expect(revealDelta({ top: 700, bottom: 750 }, area)).toBe(475)
  })

  it('pole nad obszarem jest przewijane w górę', () => {
    expect(revealDelta({ top: -60, bottom: -10 }, area)).toBe(-285)
  })

  it('pole wyższe niż obszar wyrównujemy do góry z marginesem', () => {
    expect(revealDelta({ top: 300, bottom: 900 }, area)).toBe(280)
  })
})

describe('skrypt startowy w index.html (pierwszy render przed aplikacją)', () => {
  const html = readFileSync('index.html', 'utf8')
  const script = /<script id="boot-layout">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? ''

  /** Uruchamia skrypt z atrapami przeglądarki i zwraca, co ustawił na <html> */
  function boot(env: { standalone: boolean; ua: string; iw: number; ih: number; sw: number; sh: number }) {
    const vars: Record<string, string> = {}
    const classes: string[] = []
    runInNewContext(script, {
      navigator: { standalone: env.standalone, userAgent: env.ua },
      matchMedia: () => ({ matches: false }),
      innerWidth: env.iw,
      innerHeight: env.ih,
      screen: { width: env.sw, height: env.sh },
      document: { documentElement: { style: { setProperty: (k: string, v: string) => (vars[k] = v) }, classList: { add: (c: string) => classes.push(c) } } },
    })
    return { vars, classes }
  }
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'

  it('istnieje', () => {
    expect(script.trim().length).toBeGreaterThan(50)
  })

  it('iPhone z ekranu głównego, krótszy widok: wysokość pełnego ekranu — tak samo jak computeLayout', () => {
    const r = boot({ standalone: true, ua: IPHONE, iw: 393, ih: 802, sw: 393, sh: 852 })
    expect(r.vars['--app-height']).toBe('852px')
    expect(r.classes).toEqual(['fit-screen'])
    expect(computeLayout(phone({ innerHeight: 802, vvHeight: 802 })).height).toBe(852)
  })

  it('obrót w poziomie: krótszy wymiar ekranu, zgodnie z computeLayout', () => {
    const r = boot({ standalone: true, ua: IPHONE, iw: 852, ih: 393, sw: 393, sh: 852 })
    expect(r.vars['--app-height']).toBe('393px')
    expect(computeLayout(phone({ innerWidth: 852, innerHeight: 393, vvHeight: 393 })).height).toBe(393)
  })

  it('zwykła przeglądarka i inne urządzenia: nic nie zmienia', () => {
    expect(boot({ standalone: false, ua: IPHONE, iw: 393, ih: 700, sw: 393, sh: 852 })).toEqual({ vars: {}, classes: [] })
    expect(boot({ standalone: true, ua: 'Mozilla/5.0 (Linux; Android 14)', iw: 393, ih: 700, sw: 393, sh: 852 })).toEqual({ vars: {}, classes: [] })
  })
})
