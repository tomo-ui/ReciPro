import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { motion, useDragControls } from 'framer-motion'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { spring } from '@/lib/ui'

interface Props {
  onClose: () => void
  /** `full` (domyślnie): prawie cały ekran. `large`: ok. ¾ ekranu, jak panel komentarzy w Instagramie */
  size?: 'full' | 'large'
  /** Ponad innymi arkuszami i menu (np. zgłoszenie treści otwierane z otwartego panelu komentarzy) */
  elevated?: boolean
  children: ReactNode
}

/**
 * Modalny sheet. Telefon: w stylu iOS — sprężynowy wjazd od dołu, przeciągnięcie za uchwyt zamyka.
 * Komputer (od 1024 px): okno dialogowe na środku ekranu, z przyciemnieniem całej strony, bez przeciągania; zamyka je też Esc.
 * Renderowany w portalu, więc przyciemnienie obejmuje całe okno przeglądarki (także boczny pasek nawigacji).
 */
export function Sheet({ onClose, size = 'full', elevated, children }: Props) {
  const controls = useDragControls()
  const desktop = useIsDesktop()
  // `interactive-widget=resizes-content` w index.html już każe przeglądarce kurczyć realny viewport
  // pod klawiaturę ekranową — zwykłe `bottom-0`/`vh` same za tym nadążają, bez dodatkowego JS
  // (który tylko z tym kolidował i wypychał panel poza ekran).
  const top = size === 'large' ? '25vh' : 'calc(env(safe-area-inset-top, 0px) + 10px)'

  // Esc zamyka arkusz; zgłoszenie otwarte nad nim (data-esc-handled) obsługuje Esc samo i zamyka tylko siebie
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      if (!elevated && document.querySelector('[data-esc-handled]')) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [elevated, onClose])

  const panel = (
    <motion.div
      role="dialog"
      aria-modal="true"
      className={
        desktop
          ? 'pointer-events-auto relative flex w-full flex-col overflow-hidden rounded-[24px] bg-bg shadow-2xl'
          : `fixed inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-t-[28px] bg-bg shadow-2xl transition-[top] duration-300 ease-out ${elevated ? 'z-[75]' : 'z-50'}`
      }
      style={desktop ? { maxWidth: size === 'large' ? 640 : 760, height: size === 'large' ? 'min(80vh, 760px)' : 'min(90vh, 900px)' } : { top }}
      initial={desktop ? { opacity: 0, scale: 0.96, y: 12 } : { y: '100%' }}
      animate={desktop ? { opacity: 1, scale: 1, y: 0 } : { y: 0 }}
      exit={desktop ? { opacity: 0, scale: 0.96, y: 12 } : { y: '100%' }}
      transition={desktop ? { duration: 0.18, ease: 'easeOut' } : spring}
      drag={desktop ? false : 'y'}
      dragControls={controls}
      dragListener={false}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0.04, bottom: 0.7 }}
      onDragEnd={(_, info) => {
        if (info.offset.y > 120 || info.velocity.y > 600) onClose()
      }}
    >
      {/* Uchwyt — tylko on inicjuje drag, żeby nie kolidować ze scrollem i polami (na komputerze nie ma przeciągania) */}
      {!desktop && (
        <div className="flex h-7 shrink-0 cursor-grab touch-none items-center justify-center" onPointerDown={(e) => controls.start(e)}>
          <div className="h-[5px] w-9 rounded-full bg-label-3" />
        </div>
      )}
      {children}
    </motion.div>
  )

  return createPortal(
    <>
      <motion.div
        className={`fixed inset-0 bg-black/45 ${elevated ? 'z-[72]' : 'z-40'}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        onClick={onClose}
      />
      {desktop ? <div className={`pointer-events-none fixed inset-0 flex items-center justify-center p-6 ${elevated ? 'z-[75]' : 'z-50'}`}>{panel}</div> : panel}
    </>,
    document.body,
  )
}
