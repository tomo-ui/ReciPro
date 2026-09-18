import type { ReactNode } from 'react'
import { motion, useDragControls } from 'framer-motion'
import { spring } from '@/lib/ui'
import { ChevronLeftIcon } from './Icons'

interface Props {
  title: string
  onBack: () => void
  children: ReactNode
}

/** Ekran „wepchnięty” na stos (np. cudzy profil): wjazd z prawej, przycisk wstecz i swipe od lewej krawędzi */
export function PushedScreen({ title, onBack, children }: Props) {
  const controls = useDragControls()
  return (
    <motion.div
      className="fixed inset-0 z-30 bg-bg shadow-[-8px_0_24px_rgba(0,0,0,0.15)]"
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={spring}
      drag="x"
      dragControls={controls}
      dragListener={false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={{ left: 0, right: 1 }}
      onDragEnd={(_, info) => {
        if (info.offset.x > 100 || info.velocity.x > 500) onBack()
      }}
    >
      <div className="absolute inset-y-0 left-0 z-40 w-5 touch-pan-y" onPointerDown={(e) => controls.start(e)} />

      <div className="glass absolute inset-x-0 top-0 z-20 border-b border-separator pt-safe-top">
        <div className="relative flex h-11 items-center justify-center px-[max(12px,env(safe-area-inset-left))]">
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={onBack}
            aria-label="Wróć"
            className="absolute left-[max(8px,env(safe-area-inset-left))] flex h-9 items-center gap-0.5 rounded-full pr-2 text-accent"
          >
            <ChevronLeftIcon />
          </motion.button>
          <h2 className="max-w-[60%] truncate text-[17px] font-semibold">{title}</h2>
        </div>
      </div>

      <div className="scroll-y h-full">
        <div className="pt-[calc(env(safe-area-inset-top,0px)+44px)] pb-[calc(env(safe-area-inset-bottom,0px)+32px)]">{children}</div>
      </div>
    </motion.div>
  )
}
