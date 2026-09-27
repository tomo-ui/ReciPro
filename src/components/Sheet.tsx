import { useEffect, useState, type ReactNode } from 'react'
import { motion, useDragControls } from 'framer-motion'
import { spring } from '@/lib/ui'

interface Props {
  onClose: () => void
  /** `full` (domyślnie): prawie cały ekran. `large`: ok. ¾ ekranu, jak panel komentarzy w Instagramie */
  size?: 'full' | 'large'
  children: ReactNode
}

/**
 * Ile px u dołu układu strony zasłania teraz klawiatura ekranowa (różnica między pełnym
 * viewportem a visualViewport). Bez tego elementy `position: fixed` przypięte do dołu
 * (pole komentarza, przyciski) chowają się pod klawiaturą zamiast zostać nad nią.
 */
function useKeyboardInset(): number {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => setInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop))
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])
  return inset
}

/** Modalny sheet w stylu iOS: sprężynowy wjazd, przeciągnięcie za uchwyt zamyka */
export function Sheet({ onClose, size = 'full', children }: Props) {
  const controls = useDragControls()
  // Klawiatura otwarta: panel „large” rośnie w górę i zostaje tuż nad nią, jak w Instagramie
  const keyboardInset = useKeyboardInset()
  const top = size === 'large' ? (keyboardInset > 0 ? '10vh' : '25vh') : 'calc(env(safe-area-inset-top, 0px) + 10px)'

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
        style={{ top, bottom: keyboardInset, transition: 'top 0.25s ease, bottom 0.25s ease' }}
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
