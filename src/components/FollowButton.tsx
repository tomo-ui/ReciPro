import { useState } from 'react'
import { motion } from 'framer-motion'
import { backend } from '@/lib/data'
import { emit } from '@/lib/events'
import { SpinnerIcon } from './Icons'

interface Props {
  userId: string
  following: boolean
  /** Wywoływane po udanej zmianie (żeby rodzic zaktualizował licznik) */
  onChange: (following: boolean) => void
  compact?: boolean
  /** Bez zdarzenia „follows-changed” (np. w feedzie, który ma się nie przeładowywać pod palcem) */
  silent?: boolean
}

/** Przycisk „Obserwuj / Obserwujesz” z natychmiastową reakcją i cofnięciem przy błędzie */
export function FollowButton({ userId, following, onChange, compact, silent }: Props) {
  const [busy, setBusy] = useState(false)

  async function toggle(e: React.MouseEvent) {
    e.stopPropagation()
    if (busy) return
    setBusy(true)
    const next = !following
    onChange(next) // optymistycznie
    try {
      await (next ? backend.follow(userId) : backend.unfollow(userId))
      if (!silent) emit('follows-changed') // feed odświeży się przy następnym wejściu
    } catch (err) {
      onChange(following) // cofamy
      alert(err instanceof Error ? err.message : 'Nie udało się zmienić obserwowania.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.button
      whileTap={{ scale: 0.94 }}
      onClick={toggle}
      className={`flex items-center justify-center gap-1.5 rounded-[10px] font-semibold transition-colors ${
        compact ? 'px-3.5 py-1.5 text-[14px]' : 'px-6 py-2 text-[15px]'
      } ${following ? 'bg-surface-2 text-label' : 'bg-accent text-white'}`}
    >
      {busy && <SpinnerIcon width={14} height={14} />}
      {following ? 'Obserwujesz' : 'Obserwuj'}
    </motion.button>
  )
}
