import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { BADGE_TIERS, type VerifiedBadgeTier } from '@/lib/badgeTiers'
import { VerifiedBadge } from './VerifiedBadge'

interface Props {
  badge: VerifiedBadgeTier
  /** Nazwa użytkownika, którego znaczek oglądamy */
  username: string
  onClose: () => void
}

/**
 * Mały panel po dotknięciu znaczka na profilu: co to za weryfikacja i do jakiej klasy (koloru) należy.
 * Zamyka się dotknięciem tła, przyciskiem albo klawiszem Esc.
 */
export function BadgeInfoPanel({ badge, username, onClose }: Props) {
  const tier = BADGE_TIERS[badge]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-8">
      <motion.div className="absolute inset-0 bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }} onClick={onClose} />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="badge-info-title"
        initial={{ opacity: 0, scale: 0.94, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.16 }}
        className="relative w-full max-w-[300px] overflow-hidden rounded-[20px] bg-surface text-center shadow-2xl"
      >
        <div className="px-5 pt-5 pb-4">
          <div className="flex justify-center">
            <VerifiedBadge badge={badge} size={46} className="!ml-0" />
          </div>
          <h2 id="badge-info-title" className="mt-3 text-[17px] font-semibold">
            Zweryfikowany profil
          </h2>
          <p className="mt-0.5 text-[13px] text-label-2">@{username}</p>

          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold text-white" style={{ background: tier.color }}>
            Klasa: {tier.className}
          </p>
          <p className="mt-2.5 text-[16px] font-semibold">{tier.label}</p>
          <p className="mt-1 text-[14px] leading-snug text-label-2">{tier.description}</p>
        </div>
        <button onClick={onClose} className="block w-full border-t border-separator py-3.5 text-[16px] font-semibold text-accent active:bg-surface-2">
          Zamknij
        </button>
      </motion.div>
    </div>,
    document.body,
  )
}
