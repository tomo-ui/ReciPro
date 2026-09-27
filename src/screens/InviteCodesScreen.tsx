import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import type { InviteCode } from '@/lib/backend'
import { backend } from '@/lib/data'
import { CheckIcon, SpinnerIcon } from '@/components/Icons'

interface Props {
  onClose: () => void
}

/**
 * Kody zaproszeń do zamkniętej bety: dostępne wyłącznie z Ustawień, tylko dla konta twórcy aplikacji
 * (patrz SettingsMenu i App.tsx). Każdy kod działa raz — po rejestracji od razu się zużywa.
 */
export function InviteCodesScreen({ onClose }: Props) {
  const [codes, setCodes] = useState<InviteCode[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const load = () =>
    backend
      .listInviteCodes()
      .then(setCodes)
      .catch((e) => setError(e instanceof Error ? e.message : 'Nie udało się wczytać kodów.'))

  useEffect(() => {
    load()
  }, [])

  async function generate() {
    setGenerating(true)
    setError(null)
    try {
      await backend.createInviteCode()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się utworzyć kodu.')
    } finally {
      setGenerating(false)
    }
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(code)
      setTimeout(() => setCopied((c) => (c === code ? null : c)), 1500)
    } catch {
      /* schowek niedostępny — nic się nie dzieje, kod i tak jest widoczny na ekranie */
    }
  }

  const unused = codes?.filter((c) => !c.used_at) ?? []
  const used = codes?.filter((c) => c.used_at) ?? []

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-11 shrink-0 items-center justify-between px-4">
        <span className="w-16" />
        <h2 className="text-[17px] font-semibold">Kody zaproszeń</h2>
        <button onClick={onClose} className="w-16 text-right text-[17px] font-semibold text-accent active:opacity-50">
          Gotowe
        </button>
      </header>
      <div className="scroll-y flex-1 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+24px)]">
        <p className="pb-3 text-[13px] text-label-2">
          Bez ważnego kodu nikt nie założy konta. Każdy kod działa tylko raz — po rejestracji od razu się zużywa.
        </p>
        <motion.button
          whileTap={{ scale: 0.97 }}
          disabled={generating}
          onClick={generate}
          className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-accent py-3.5 text-[16px] font-semibold text-white disabled:opacity-50"
        >
          {generating && <SpinnerIcon />}
          Wygeneruj nowy kod
        </motion.button>

        {error && <p className="pt-3 text-center text-[14px] text-red-500">{error}</p>}

        {codes === null ? (
          <div className="flex justify-center pt-8">
            <SpinnerIcon width={22} height={22} className="text-label-2" />
          </div>
        ) : codes.length === 0 ? (
          <p className="pt-8 text-center text-[14px] text-label-2">Jeszcze żadnego kodu.</p>
        ) : (
          <>
            {unused.length > 0 && (
              <div className="pt-5">
                <h3 className="mb-2 text-[13px] font-semibold text-label-2">Do wykorzystania ({unused.length})</h3>
                <div className="grid grid-cols-2 gap-2">
                  {unused.map((c) => (
                    <motion.button
                      key={c.code}
                      whileTap={{ scale: 0.96 }}
                      onClick={() => copy(c.code)}
                      className="flex items-center justify-center gap-1.5 rounded-[14px] bg-surface py-3 font-mono text-[18px] font-bold tracking-[0.2em]"
                    >
                      {copied === c.code && <CheckIcon width={16} height={16} className="text-green-500" />}
                      {c.code}
                    </motion.button>
                  ))}
                </div>
              </div>
            )}
            {used.length > 0 && (
              <div className="pt-5">
                <h3 className="mb-2 text-[13px] font-semibold text-label-2">Wykorzystane ({used.length})</h3>
                <div className="grid grid-cols-2 gap-2">
                  {used.map((c) => (
                    <span
                      key={c.code}
                      className="rounded-[14px] bg-surface py-3 text-center font-mono text-[15px] tracking-[0.2em] text-label-3 line-through"
                    >
                      {c.code}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
