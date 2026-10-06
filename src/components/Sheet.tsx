import type { ReactNode } from 'react'
import { motion, useDragControls } from 'framer-motion'
import { spring } from '@/lib/ui'

interface Props {
  onClose: () => void
  /** `full` (domyślnie): prawie cały ekran. `large`: ok. ¾ ekranu, jak panel komentarzy w Instagramie */
  size?: 'full' | 'large'
  /** Ponad innymi arkuszami i menu (np. zgłoszenie treści otwierane z otwartego panelu komentarzy) */
  elevated?: boolean
  children: ReactNode
}

/** Modalny sheet w stylu iOS: sprężynowy wjazd, przeciągnięcie za uchwyt zamyka */
export function Sheet({ onClose, size = 'full', elevated, children }: Props) {
  const controls = useDragControls()
  // `interactive-widget=resizes-content` w index.html już każe przeglądarce kurczyć realny viewport
  // pod klawiaturę ekranową — zwykłe `bottom-0`/`vh` same za tym nadążają, bez dodatkowego JS
  // (który tylko z tym kolidował i wypychał panel poza ekran).
  const top = size === 'large' ? '25vh' : 'calc(env(safe-area-inset-top, 0px) + 10px)'

  return (
    <>
      <motion.div
        className={`fixed inset-0 bg-black/40 ${elevated ? 'z-[72]' : 'z-40'}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        onClick={onClose}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        className={`fixed inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-t-[28px] bg-bg shadow-2xl transition-[top] duration-300 ease-out ${elevated ? 'z-[75]' : 'z-50'}`}
        style={{ top }}
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
