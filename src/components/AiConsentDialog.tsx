import { useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { LEGAL } from '@/lib/legal'
import { SparkleIcon, SpinnerIcon } from './Icons'

interface Props {
  /** Użytkownik się zgodził (zapis zgody w bazie) */
  onAccept: () => Promise<void>
  onDecline: () => void
}

/**
 * Zgoda przed pierwszym importem (Apple 5.1.2(i)): co wysyłamy, komu, po co — i że nie trzeba się zgadzać.
 * Zmieniając treść, podnieś AI_CONSENT_VERSION w lib/consent.ts.
 */
export function AiConsentDialog({ onAccept, onDecline }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function accept() {
    setBusy(true)
    setError(null)
    try {
      await onAccept()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się zapisać zgody. Spróbuj ponownie.')
      setBusy(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-5">
      <motion.div className="absolute inset-0 bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} onClick={busy ? undefined : onDecline} />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-consent-title"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.16 }}
        className="relative max-h-[88dvh] w-full max-w-[380px] overflow-hidden rounded-[22px] bg-surface shadow-2xl"
      >
        <div className="scroll-y max-h-[calc(88dvh-64px)] px-5 pt-5 pb-3">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
            <SparkleIcon width={26} height={26} />
          </span>
          <h2 id="ai-consent-title" className="mt-3 text-center text-[19px] font-semibold">
            Import z pomocą AI
          </h2>
          <p className="mt-2 text-[14px] text-label-2">
            Żeby odczytać przepis z linku, posta, tekstu lub zdjęcia, ReciPro wysyła jego treść do zewnętrznej usługi AI (Google Gemini), która rozdziela składniki i kroki.
          </p>
          <ul className="mt-3 space-y-2 text-[14px]">
            <li className="flex gap-2">
              <span aria-hidden className="text-accent">•</span>
              <span>
                <strong>Co wysyłamy:</strong> tylko to, co importujesz — treść strony lub opisu posta, wklejony tekst albo zrzuty ekranu. Nie wysyłamy Twojego e-maila ani danych profilu.
              </span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden className="text-accent">•</span>
              <span>
                <strong>Co dalej:</strong> zdjęcia służą tylko do odczytu i nie są zapisywane. Dostawca nie używa przesłanych treści do trenowania modeli.
              </span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden className="text-accent">•</span>
              <span>
                <strong>To dobrowolne:</strong> zgodę możesz cofnąć w każdej chwili (Ustawienia → Prywatność i bezpieczeństwo). Bez niej dodasz przepis ręcznie.
              </span>
            </li>
          </ul>
          <p className="mt-3 text-[13px] text-label-2">
            Szczegóły: <a href={LEGAL.privacy} target="_blank" rel="noopener noreferrer" className="font-medium text-accent">Polityka prywatności</a>.
          </p>
          {error && <p className="mt-3 text-[13px] text-red-500">{error}</p>}
        </div>
        <div className="flex border-t border-separator">
          <button onClick={onDecline} disabled={busy} className="flex-1 border-r border-separator py-3.5 text-[16px] font-medium active:bg-surface-2 disabled:opacity-40">
            Nie teraz
          </button>
          <button onClick={() => void accept()} disabled={busy} className="flex flex-1 items-center justify-center gap-2 py-3.5 text-[16px] font-semibold text-accent active:bg-surface-2 disabled:opacity-60">
            {busy && <SpinnerIcon width={16} height={16} />}
            Zgadzam się
          </button>
        </div>
      </motion.div>
    </div>,
    document.body,
  )
}
