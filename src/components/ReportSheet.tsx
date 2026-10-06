import { useState } from 'react'
import { motion } from 'framer-motion'
import { backend } from '@/lib/data'
import { REPORT_REASONS, type ReportReason } from '@/types/moderation'
import type { ModerationRequest } from '@/lib/moderationUi'
import { CheckIcon, SpinnerIcon } from './Icons'
import { Group } from './formParts'

interface Props {
  request: ModerationRequest
  onClose: () => void
  /** „Zablokuj” po wysłaniu zgłoszenia (ekran potwierdzenia proponuje to od razu) */
  onBlock: () => void
}

const MAX_DETAILS = 500

/** Zgłoszenie przepisu, komentarza albo profilu: powód + opcjonalny opis → moderacja (zwykle w ciągu 24 h) */
export function ReportSheet({ request, onClose, onBlock }: Props) {
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const canSend = !!reason && !busy && (reason !== 'other' || details.trim().length > 0)

  async function send() {
    if (!reason || !canSend) return
    setBusy(true)
    setError(null)
    try {
      await backend.reportContent(request.target, reason, details)
      setSent(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się wysłać zgłoszenia.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-11 shrink-0 items-center justify-between px-4">
        {sent ? (
          <span className="w-16" />
        ) : (
          <button onClick={onClose} className="w-16 text-left text-[17px] text-accent active:opacity-50">
            Anuluj
          </button>
        )}
        <h2 className="text-[17px] font-semibold">Zgłoszenie</h2>
        {sent ? (
          <button onClick={onClose} className="w-16 text-right text-[17px] font-semibold text-accent active:opacity-50">
            Gotowe
          </button>
        ) : (
          <button
            onClick={send}
            disabled={!canSend}
            className="flex w-16 items-center justify-end gap-1 text-[17px] font-semibold text-accent transition-opacity active:opacity-50 disabled:opacity-35"
          >
            {busy && <SpinnerIcon width={16} height={16} />}
            Wyślij
          </button>
        )}
      </header>

      <div className="scroll-y flex-1 px-4 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+24px)]">
        {sent ? (
          <div className="flex flex-col items-center gap-3 pt-8 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/15 text-green-600">
              <CheckIcon width={28} height={28} />
            </span>
            <p className="text-[18px] font-semibold">Dziękujemy za zgłoszenie</p>
            <p className="max-w-xs text-[14px] text-label-2">Sprawdzimy tę treść i, jeśli łamie regulamin lub prawo, usuniemy ją — zwykle w ciągu 24 godzin.</p>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={onBlock}
              className="mt-3 w-full rounded-[14px] bg-surface py-3.5 text-[16px] font-medium text-red-500 active:bg-surface-2"
            >
              Zablokuj @{request.username}
            </motion.button>
            <p className="max-w-xs text-[13px] text-label-2">Zablokowana osoba i jej treści znikną dla Ciebie, a Ty dla niej.</p>
          </div>
        ) : (
          <>
            <p className="px-1 pb-3 text-[14px] text-label-2">{request.label}</p>
            <p className="mb-1.5 px-4 text-[13px] text-label-2 uppercase">Co jest nie tak?</p>
            <Group>
              {REPORT_REASONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  role="radio"
                  aria-checked={reason === r.value}
                  onClick={() => setReason(r.value)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px]">{r.label}</span>
                    <span className="block text-[12px] text-label-2">{r.hint}</span>
                  </span>
                  {reason === r.value && <CheckIcon width={20} height={20} className="shrink-0 text-accent" />}
                </button>
              ))}
            </Group>

            <p className="mt-5 mb-1.5 px-4 text-[13px] text-label-2 uppercase">{reason === 'other' ? 'Opis (wymagany)' : 'Dodatkowy opis (opcjonalnie)'}</p>
            <Group>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value.slice(0, MAX_DETAILS))}
                placeholder="Napisz, co się stało…"
                rows={3}
                className="block min-h-20 w-full resize-none bg-transparent px-4 py-3 outline-none [field-sizing:content] placeholder:text-label-3"
              />
            </Group>
            <p className="mt-1.5 px-4 text-[12px] text-label-2">
              Zgłaszający pozostaje anonimowy dla osoby, której dotyczy zgłoszenie. Nadużywanie zgłoszeń może skutkować ograniczeniem konta.
            </p>
            {error && <p className="mt-3 px-1 text-[14px] text-red-500">{error}</p>}
          </>
        )}
      </div>
    </div>
  )
}
