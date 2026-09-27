import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion, useDragControls } from 'framer-motion'
import { spring } from '@/lib/ui'

interface Props {
  onClose: () => void
  /** `full` (domyślnie): prawie cały ekran. `large`: ok. ¾ ekranu, jak panel komentarzy w Instagramie */
  size?: 'full' | 'large'
  children: ReactNode
}

/**
 * Rzeczywiście widoczny obszar ekranu (visualViewport), nie window.innerHeight — na iOS klawiatura
 * ekranowa różnie wpływa na te dwie wielkości w zależności od trybu (Safari kontra zainstalowana PWA;
 * w PWA obie potrafią skurczyć się razem). Dlatego NIE liczymy różnicy między nimi — zawsze pozycjonujemy
 * panel wprost względem bieżącego obszaru, a „klawiatura otwarta” poznajemy po tym, że jest on wyraźnie
 * mniejszy niż największa dotąd zmierzona wysokość (czyli stan sprzed pojawienia się klawiatury).
 */
function useVisibleViewport() {
  const [state, setState] = useState(() => ({ top: 0, height: typeof window === 'undefined' ? 0 : window.innerHeight }))
  const maxHeight = useRef(state.height)

  useEffect(() => {
    const vv = window.visualViewport
    const update = () => {
      const next = vv ? { top: vv.offsetTop, height: vv.height } : { top: 0, height: window.innerHeight }
      if (next.height > maxHeight.current) maxHeight.current = next.height
      setState(next)
    }
    update()
    vv?.addEventListener('resize', update)
    vv?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      vv?.removeEventListener('resize', update)
      vv?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])

  const bottomInset = Math.max(0, maxHeight.current - (state.top + state.height))
  const keyboardOpen = state.height < maxHeight.current - 80
  return { top: state.top, height: state.height, bottomInset, keyboardOpen }
}

/** Modalny sheet w stylu iOS: sprężynowy wjazd, przeciągnięcie za uchwyt zamyka */
export function Sheet({ onClose, size = 'full', children }: Props) {
  const controls = useDragControls()
  // Klawiatura otwarta: panel „large” rośnie w górę i zostaje tuż nad nią, jak w Instagramie
  const { top: vvTop, height: vvHeight, bottomInset, keyboardOpen } = useVisibleViewport()
  const top = size === 'large' ? vvTop + vvHeight * (keyboardOpen ? 0.1 : 0.25) : 'calc(env(safe-area-inset-top, 0px) + 10px)'

  return (
    <>
      <motion.div
        className="fixed inset-0 z-40 bg-black/40"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        onClick={onClose}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        className="fixed inset-x-0 z-50 flex flex-col overflow-hidden rounded-t-[28px] bg-bg shadow-2xl"
        style={{ top, bottom: bottomInset, transition: 'top 0.2s ease, bottom 0.2s ease' }}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={spring}
        drag="y"
        dragControls={controls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.04, bottom: 0.7 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 120 || info.velocity.y > 600) onClose()
        }}
      >
        {/* Uchwyt — tylko on inicjuje drag, żeby nie kolidować ze scrollem i polami */}
        <div
          className="flex h-7 shrink-0 cursor-grab touch-none items-center justify-center"
          onPointerDown={(e) => controls.start(e)}
        >
          <div className="h-[5px] w-9 rounded-full bg-label-3" />
        </div>
        {children}
      </motion.div>
    </>
  )
}
