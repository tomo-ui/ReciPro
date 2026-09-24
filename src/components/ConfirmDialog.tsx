import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'

interface Props {
  title: string
  message?: string
  confirmLabel?: string
  /** false = zwykłe potwierdzenie (przycisk w kolorze accent zamiast czerwonego) */
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Zamiennik natywnego window.confirm() w stylu alertu iOS: wyśrodkowana karta z tytułem i dwoma przyciskami.
 * confirm() bywa niewiarygodny w zainstalowanej (standalone) aplikacji PWA na iOS — potrafi cicho zwrócić
 * false bez pokazania okna, więc każde potwierdzenie usunięcia budujemy sami.
 */
export function ConfirmDialog({ title, message, confirmLabel = 'Usuń', destructive = true, onConfirm, onCancel }: Props) {
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-10">
      <motion.div className="absolute inset-0 bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onClick={onCancel} />
      <motion.div
        role="alertdialog"
        aria-modal="true"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.16 }}
        className="relative w-full max-w-[300px] overflow-hidden rounded-[18px] bg-surface shadow-2xl"
      >
        <div className="space-y-1 px-5 pt-5 pb-4 text-center">
          <p className="text-[16px] font-semibold">{title}</p>
          {message && <p className="text-[13px] text-label-2">{message}</p>}
        </div>
        <div className="flex border-t border-separator">
          <button onClick={onCancel} className="flex-1 border-r border-separator py-3 text-[16px] font-medium active:bg-surface-2">
            Anuluj
          </button>
          <button onClick={onConfirm} className={`flex-1 py-3 text-[16px] font-semibold active:bg-surface-2 ${destructive ? 'text-red-500' : 'text-accent'}`}>
            {confirmLabel}
          </button>
        </div>
      </motion.div>
    </div>,
    document.body,
  )
}
