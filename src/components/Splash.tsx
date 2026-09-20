import { useEffect, useRef, useState } from 'react'
import { animate, motion } from 'framer-motion'
import { LOGO_TARGET_ID, markLogoLanded, useAppReady } from '@/lib/splash'
import { AppLogo } from './AppLogo'

/** Tyle najkrócej trwa ekran startowy, żeby buzia zdążyła się uśmiechnąć i mrugnąć */
const MIN_VISIBLE_MS = 1300
/** Awaryjnie: nigdy nie trzymamy ekranu startowego dłużej, nawet bez sygnału gotowości */
const MAX_VISIBLE_MS = 8000

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Ekran startowy: logo w tym samym miejscu i rozmiarze co na statycznym obrazie startowym iOS
 * (scripts/gen-splash.mjs) — buzia się uśmiecha i mruga, po czym logo wskakuje na swoje miejsce
 * na ekranie logowania i tam zostaje. Gdy nie ma ekranu logowania (jesteśmy zalogowani), po prostu znika.
 */
export function Splash() {
  const ready = useAppReady()
  const [phase, setPhase] = useState<'wait' | 'leave' | 'done'>('wait')
  const [minPassed, setMinPassed] = useState(false)
  const [jump, setJump] = useState<{ x: number; y: number } | null>(null)
  const iconRef = useRef<HTMLDivElement>(null)
  const reduced = useRef(reducedMotion()).current

  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    const min = setTimeout(() => setMinPassed(true), reduced ? 0 : MIN_VISIBLE_MS)
    const max = setTimeout(() => setTimedOut(true), MAX_VISIBLE_MS)
    return () => {
      clearTimeout(min)
      clearTimeout(max)
    }
  }, [reduced])

  useEffect(() => {
    if (phase !== 'wait' || !minPassed || !(ready || timedOut)) return
    const target = document.getElementById(LOGO_TARGET_ID)
    const icon = iconRef.current
    if (target && icon && !reduced) {
      const t = target.getBoundingClientRect()
      const i = icon.getBoundingClientRect()
      setJump({ x: t.left - i.left, y: t.top - i.top })
    }
    setPhase('leave')
  }, [phase, ready, timedOut, minPassed, reduced])

  // Wyjście: skok na miejsce logo z ekranu logowania albo (bez niego) zanik. Po zakończeniu ekran startowy znika,
  // a prawdziwe logo jest już widoczne dokładnie w tym samym miejscu.
  useEffect(() => {
    if (phase !== 'leave') return
    const icon = iconRef.current
    let cancelled = false
    const done = () => {
      if (cancelled) return
      markLogoLanded()
      setPhase('done')
    }
    if (!icon) return done()
    const runs = jump
      ? [
          animate(icon, { x: jump.x }, { duration: 0.62, ease: 'easeInOut' }),
          animate(icon, { y: [0, Math.min(0, jump.y) - 34, jump.y] }, { duration: 0.62, times: [0, 0.45, 1], ease: ['easeOut', 'easeIn'] }),
          animate(icon, { scale: [1, 1.07, 1] }, { duration: 0.62, times: [0, 0.45, 1] }),
        ]
      : [animate(icon, { scale: 1.12, opacity: 0 }, { duration: 0.35, ease: 'easeIn' })]
    void Promise.all(runs.map((r) => r.finished ?? r)).then(done)
    return () => {
      cancelled = true
      runs.forEach((r) => r.stop())
    }
  }, [phase, jump])

  if (phase === 'done') return null

  const leaving = phase === 'leave'

  return (
    <div className={`fixed inset-0 z-[100] ${leaving ? 'pointer-events-none' : ''}`}>
      <motion.div
        className="absolute inset-0 bg-bg"
        animate={{ opacity: leaving ? 0 : 1 }}
        transition={{ duration: 0.35, delay: leaving && jump ? 0.12 : 0 }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <div ref={iconRef}>
          <AppLogo size={80} play={!reduced} />
        </div>
      </div>
    </div>
  )
}
