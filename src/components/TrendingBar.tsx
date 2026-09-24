import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import type { Recipe } from '@/types/recipe'
import { backend } from '@/lib/data'
import { coverGradient } from '@/lib/ui'

interface Props {
  onOpen: (recipe: Recipe) => void
}

/** Gradient obwódki jak przy nieobejrzanych relacjach na Instagramie */
const RING = 'conic-gradient(from 45deg, #f97316, #ef4444, #ec4899, #f97316)'
const PLACEHOLDERS = Array.from({ length: 6 })

/**
 * Pasek najpopularniejszych przepisów z ostatnich 14 dni (wyświetlenia, polubienia, komentarze, zapisania),
 * jak Instastories nad feedem. Dotknięcie otwiera przepis; sam pasek znika, gdy nic jeszcze nie jest popularne.
 */
export function TrendingBar({ onOpen }: Props) {
  const [items, setItems] = useState<Recipe[] | null | undefined>(undefined)

  useEffect(() => {
    let alive = true
    backend
      .trending(15)
      .then((r) => alive && setItems(r))
      .catch(() => alive && setItems(null))
    return () => {
      alive = false
    }
  }, [])

  if (items === null || (items && items.length === 0)) return null

  return (
    <div className="scroll-y -mx-4 mb-3 flex gap-3 overflow-x-auto px-4 pb-1">
      {items === undefined
        ? PLACEHOLDERS.map((_, i) => <div key={i} className="h-[76px] w-16 shrink-0 animate-pulse rounded-full bg-surface" />)
        : items.map((r) => (
            <motion.button key={r.id} whileTap={{ scale: 0.94 }} onClick={() => onOpen(r)} className="flex w-16 shrink-0 flex-col items-center gap-1">
              <span className="flex h-16 w-16 items-center justify-center rounded-full p-[2.5px]" style={{ background: RING }}>
                <span
                  className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border-2 border-bg"
                  style={{ background: coverGradient(r.id + r.title) }}
                >
                  {r.image_url ? (
                    <img src={r.image_url} alt="" className="h-full w-full object-cover" draggable={false} onError={(e) => (e.currentTarget.style.display = 'none')} />
                  ) : (
                    <span className="text-[17px] font-bold text-white/70">{r.title.charAt(0).toUpperCase()}</span>
                  )}
                </span>
              </span>
              <span className="w-full truncate text-center text-[11px] text-label-2">{r.title}</span>
            </motion.button>
          ))}
    </div>
  )
}
