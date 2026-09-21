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
