import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { spring } from '@/lib/ui'

export interface SheetAction {
  label: string
  onClick: () => void
  /** Czerwony tekst — działanie destrukcyjne albo blokujące */
  danger?: boolean
}

interface Props {
  title?: string
  actions: SheetAction[]
  onClose: () => void
}

/** Lista działań wysuwana od dołu, w stylu iOS (UIAlertController.actionSheet) — ponad arkuszami i ekranami aplikacji */
export function ActionSheet({ title, actions, onClose }: Props) {
  return createPortal(
    <div className="fixed inset-0 z-[70]">
      <motion.div
        className="absolute inset-0 bg-black/40"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={title ?? 'Działania'}
        className="absolute inset-x-0 bottom-0 px-2.5 pb-[calc(env(safe-area-inset-bottom,0px)+10px)]"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={spring}
      >
        <div className="overflow-hidden rounded-[16px] bg-surface">
          {title && <p className="truncate px-4 py-3 text-center text-[13px] text-label-2">{title}</p>}
          {actions.map((a) => (
            <button
              key={a.label}
              onClick={a.onClick}
              className={`block w-full border-t border-separator px-4 py-3.5 text-center text-[17px] active:bg-surface-2 ${a.danger ? 'text-red-500' : 'text-accent'}`}
            >
              {a.label}
            </button>
          ))}
        </div>
        <button onClick={onClose} className="mt-2 block w-full rounded-[16px] bg-surface px-4 py-3.5 text-center text-[17px] font-semibold text-accent active:bg-surface-2">
          Anuluj
        </button>
      </motion.div>
    </div>,
    document.body,
  )
}
