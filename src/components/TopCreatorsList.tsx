import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import type { TopCreator } from '@/lib/backend'
import { backend } from '@/lib/data'
import { Avatar } from './Avatar'
import { VerifiedBadge } from './VerifiedBadge'

interface Props {
  onOpen: (creator: TopCreator) => void
}

/** Gradient obwódki jak przy nieobejrzanych relacjach na Instagramie */
const RING = 'conic-gradient(from 45deg, #f97316, #ef4444, #ec4899, #f97316)'
const PLACEHOLDERS = Array.from({ length: 6 })

/**
 * Top 10 twórców z ostatnich 14 dni (suma viralowości ich postów), jak Instastories nad feedem.
 * Dotknięcie kółka otwiera arkusz z podglądem jego 3 najlepszych przepisów.
 */
export function TopCreatorsList({ onOpen }: Props) {
  const [items, setItems] = useState<TopCreator[] | null | undefined>(undefined)

  useEffect(() => {
    let alive = true
    backend
      .topCreators(10)
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
        : items.map((c) => (
            <motion.button key={c.user_id} whileTap={{ scale: 0.94 }} onClick={() => onOpen(c)} className="flex w-16 shrink-0 flex-col items-center gap-1">
              <span className="flex h-16 w-16 items-center justify-center rounded-full p-[2.5px]" style={{ background: RING }}>
                <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border-2 border-bg">
                  <Avatar name={c.username} src={c.avatar_url} size={60} />
                </span>
              </span>
              <span className="flex w-full min-w-0 items-center justify-center">
                <span className="min-w-0 truncate text-[11px] text-label-2">{c.username}</span>
                <VerifiedBadge username={c.username} size={10} />
              </span>
            </motion.button>
          ))}
    </div>
  )
}
