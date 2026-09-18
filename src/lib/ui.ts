import type { Transition } from 'framer-motion'
import type { Recipe } from '@/types/recipe'

/** Sprężyny zbliżone do animacji UIKit (sheet / push) */
export const spring: Transition = { type: 'spring', stiffness: 380, damping: 38, mass: 1 }
export const springSoft: Transition = { type: 'spring', stiffness: 300, damping: 30, mass: 1 }

/** Deterministyczny gradient okładki — dopóki przepis nie ma zdjęcia */
const PALETTES: [string, string][] = [
  ['#ff9a5a', '#ff5e62'],
  ['#f6d365', '#fda085'],
  ['#84fab0', '#4fb8a5'],
  ['#a18cd1', '#fbc2eb'],
  ['#89f7fe', '#66a6ff'],
  ['#fccb90', '#d57eeb'],
]

export function coverGradient(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  const [a, b] = PALETTES[h % PALETTES.length]
  return `linear-gradient(135deg, ${a}, ${b})`
}

export function formatMinutes(min?: number): string | null {
  if (!min) return null
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

export function totalTime(r: Recipe): number | undefined {
  return r.total_minutes ?? ((r.prep_minutes ?? 0) + (r.cook_minutes ?? 0) || undefined)
}
