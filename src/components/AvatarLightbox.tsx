import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { springSoft } from '@/lib/ui'

interface Props {
  /** Adres zdjęcia; null = okno zamknięte */
  src: string | null
  name: string
  onClose: () => void
}

/** Duże zdjęcie profilowe na przyciemnionym tle; dotknięcie w dowolne miejsce lub Escape zamyka */
export function AvatarLightbox({ src, name, onClose }: Props) {
  useEffect(() => {
    if (!src) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [src, onClose])

  // Portal: przodkowie z animacją (transform) psują pozycjonowanie `fixed`
  return createPortal(
    <AnimatePresence>
      {src && (
        <motion.div
          key="avatar-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`Zdjęcie profilowe: ${name}`}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.img
            src={src}
            alt=""
            draggable={false}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={springSoft}
            className="aspect-square w-[min(86vw,420px)] rounded-full object-cover shadow-2xl"
          />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
