import type { ReactNode } from 'react'
import { motion, useDragControls } from 'framer-motion'
import { spring } from '@/lib/ui'

/** Modalny sheet w stylu iOS: sprężynowy wjazd, przeciągnięcie za uchwyt zamyka */
export function Sheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const controls = useDragControls()

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
        className="fixed inset-x-0 bottom-0 z-50 flex flex-col overflow-hidden rounded-t-[28px] bg-bg shadow-2xl"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 10px)' }}
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
