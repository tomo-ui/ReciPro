import { describe, expect, it } from 'vitest'
import { slotIndexAt, type SlotMetric } from '../src/lib/tabScrub'

// pięć równych pól po 60 px, pasek z 4 px marginesu po lewej
const metrics: SlotMetric[] = Array.from({ length: 5 }, (_, i) => ({ left: 4 + i * 60, width: 60 }))

describe('przeciąganie po pasku zakładek: które pole jest pod palcem', () => {
  it('wskazuje pole, nad którym jest palec (granice: lewa włącznie, prawa wyłącznie)', () => {
    expect(slotIndexAt(4, metrics)).toBe(0)
    expect(slotIndexAt(63.9, metrics)).toBe(0)
    expect(slotIndexAt(64, metrics)).toBe(1)
    expect(slotIndexAt(150, metrics)).toBe(2)
    expect(slotIndexAt(303, metrics)).toBe(4)
  })

  it('palec poza paskiem wybiera skrajne pole (nie gubi zakładki)', () => {
    expect(slotIndexAt(-40, metrics)).toBe(0)
    expect(slotIndexAt(2, metrics)).toBe(0)
    expect(slotIndexAt(305, metrics)).toBe(4)
    expect(slotIndexAt(999, metrics)).toBe(4)
  })

  it('brak pól', () => {
    expect(slotIndexAt(10, [])).toBe(-1)
  })
})

import { pillPerimeter, rimAngleAfter } from '../src/lib/tabScrub'

describe('wężyk na obwódce paska: kąt proporcjonalny do przewinięcia', () => {
  const W = 318
  const H = 64
  const P = pillPerimeter(W, H)

  it('obwód kapsuły: dwa proste odcinki i okrąg', () => {
    expect(P).toBeCloseTo(2 * (W - H) + Math.PI * H, 5)
    expect(pillPerimeter(64, 64)).toBeCloseTo(Math.PI * 64, 5) // koło
  })

  it('przewinięcie o pełny obwód to pełny obrót (1 px przewinięcia = 1 px po obwodzie)', () => {
    expect(rimAngleAfter(0, P / 4, W, H)).toBeCloseTo(90, 5)
    expect(rimAngleAfter(0, P / 2, W, H)).toBeCloseTo(180, 5)
    expect(rimAngleAfter(10, P, W, H)).toBeCloseTo(10, 5)
  })

  it('prędkość wężyka jest proporcjonalna do prędkości przewijania (2× szybciej → 2× większa zmiana kąta)', () => {
    const slow = rimAngleAfter(0, 20, W, H)
    const fast = rimAngleAfter(0, 40, W, H)
    expect(fast).toBeCloseTo(slow * 2, 5)
  })

  it('kierunek: w dół i w górę obracają w przeciwne strony; kąt zostaje w zakresie 0–360', () => {
    const down = rimAngleAfter(100, 30, W, H)
    const up = rimAngleAfter(100, -30, W, H)
    expect(down).toBeGreaterThan(100)
    expect(up).toBeLessThan(100)
    expect(rimAngleAfter(5, -50, W, H)).toBeGreaterThanOrEqual(0)
    expect(rimAngleAfter(355, 50, W, H)).toBeLessThan(360)
  })
})
