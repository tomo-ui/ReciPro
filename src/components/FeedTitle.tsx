import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { FeedMode } from '@/lib/backend'
import { useLogoLanded } from '@/lib/splash'
import { LogoMark } from './AppLogo'
import { CheckIcon, ChevronDownIcon } from './Icons'

/** Tak długo na środku paska jest samo logo (uśmiech), zanim zamieni się w nazwę widoku */
const LOGO_MS = 4000

const OPTIONS: { value: FeedMode; label: string; hint: string }[] = [
  { value: 'foryou', label: 'Dla Ciebie', hint: 'Polecane i obserwowani' },
  { value: 'newest', label: 'Obserwowani', hint: 'Tylko obserwowani, od najnowszych' },
]

/** Logo zostaje tylko na pierwsze uruchomienie w tej sesji; po powrocie do zakładki jest już nazwa widoku */
let logoShown = false

/**
 * Środek górnego paska feedu: najpierw samo logo (uśmiech bez tła, mruga), po 4 sekundach zamienia się w nazwę
 * widoku z małą strzałką. Dotknięcie rozwija menu wyboru: „Dla Ciebie” albo „Obserwowani”.
 */
export function FeedTitle({ mode, onChange }: { mode: FeedMode; onChange: (m: FeedMode) => void }) {
  const landed = useLogoLanded()
  const [showLogo, setShowLogo] = useState(!logoShown)
  const [open, setOpen] = useState(false)

  // Odliczanie zaczyna się dopiero, gdy ekran startowy zniknie (wcześniej logo i tak jest zasłonięte)
  useEffect(() => {
    if (!showLogo || !landed) return
    const t = setTimeout(() => {
      logoShown = true
      setShowLogo(false)
    }, LOGO_MS)
    return () => clearTimeout(t)
  }, [showLogo, landed])

  const label = OPTIONS.find((o) => o.value === mode)!.label

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${label} — wybierz widok`}
        className="relative flex h-9 min-w-[7.5rem] items-center justify-center rounded-full px-3 active:opacity-60"
      >
        <AnimatePresence mode="wait" initial={false}>
          {showLogo ? (
            <motion.span
              key="logo"
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6, y: -4 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              className="text-label"
            >
              <LogoMark size={30} play />
            </motion.span>
          ) : (
            <motion.span
              key="title"
              initial={{ opacity: 0, scale: 0.85, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              className="flex items-center gap-1 text-[17px] font-semibold"
            >
              {label}
              <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ type: 'spring', stiffness: 420, damping: 28 }} className="text-label-2">
                <ChevronDownIcon width={15} height={15} strokeWidth={2.6} />
              </motion.span>
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {open && (
          <>
            <button aria-label="Zamknij menu" onClick={() => setOpen(false)} className="fixed inset-0 z-30 cursor-default" />
            <motion.div
              role="menu"
              initial={{ opacity: 0, scale: 0.92, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: -4 }}
              transition={{ type: 'spring', stiffness: 460, damping: 30 }}
              style={{ transformOrigin: 'top center' }}
              className="liquid-glass absolute top-full left-1/2 z-40 mt-2 w-64 -translate-x-1/2 overflow-hidden rounded-[22px] p-1.5"
            >
              {OPTIONS.map((o) => (
                <button
                  key={o.value}
                  role="menuitemradio"
                  aria-checked={o.value === mode}
                  onClick={() => {
                    onChange(o.value)
                    setOpen(false)
                  }}
                  className="flex w-full items-center gap-3 rounded-[16px] px-3.5 py-2.5 text-left active:bg-surface-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px] font-semibold">{o.label}</span>
                    <span className="block text-[12px] text-label-2">{o.hint}</span>
                  </span>
                  {o.value === mode && <CheckIcon width={18} height={18} strokeWidth={2.6} className="shrink-0 text-accent" />}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
