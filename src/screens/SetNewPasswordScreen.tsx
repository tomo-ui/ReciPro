import { useEffect, useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { recoveryError, recoverySessionReady } from '@/lib/authRecovery'
import { supabase } from '@/lib/supabase'
import { AppLogo } from '@/components/AppLogo'
import { SpinnerIcon } from '@/components/Icons'

const MIN_PASSWORD = 8

interface Props {
  /** Sesja z linku już działa (hasło można zapisać) albo apka wraca do normalnego logowania */
  onDone: () => void
}

/**
 * Ekran po kliknięciu linku „Nie pamiętam hasła” z maila: ustawienie nowego hasła.
 * Sesja z tokenów w linku jest już (albo zaraz będzie) aktywna — patrz lib/authRecovery.ts.
 */
export function SetNewPasswordScreen({ onDone }: Props) {
  // null = sprawdzamy link, true = można ustawić hasło, false = link nie zadziałał
  const [ready, setReady] = useState<boolean | null>(recoveryError ? false : null)
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(recoveryError)

  useEffect(() => {
    if (recoveryError) return
    recoverySessionReady.then((ok) => {
      setReady(ok)
      if (!ok) setError('Link do resetu hasła wygasł albo jest nieprawidłowy. Poproś o nowy z ekranu logowania.')
    })
  }, [])

  const mismatch = password2.length > 0 && password2 !== password
  const canSubmit = ready === true && password.length >= MIN_PASSWORD && password2 === password

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!supabase || !canSubmit || busy) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) return setError(error.message)
    onDone()
  }

  return (
    <div className="scroll-y fixed inset-0 bg-bg px-8 pt-safe-top pb-safe-bottom">
      <div className="flex min-h-full flex-col items-center justify-center py-8">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-sm">
          <div className="mx-auto mb-6 h-20 w-20">
            <AppLogo size={80} />
          </div>
          <h1 className="text-center text-[28px] font-bold tracking-tight">Nowe hasło</h1>
          <p className="mt-1 mb-6 text-center text-[15px] text-label-2">Ustaw nowe hasło do swojego konta.</p>

          {ready === null ? (
            <div className="flex justify-center py-6">
              <SpinnerIcon width={24} height={24} className="text-label-2" />
            </div>
          ) : ready ? (
            <form onSubmit={submit}>
              <div className="overflow-hidden rounded-[14px] bg-surface">
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder={`nowe hasło (min. ${MIN_PASSWORD} znaków)`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-transparent px-4 py-3.5 outline-none placeholder:text-label-3"
                />
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder="powtórz hasło"
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  aria-invalid={mismatch}
                  className="w-full border-t border-separator bg-transparent px-4 py-3.5 outline-none placeholder:text-label-3"
                />
              </div>
              {mismatch && <p className="px-4 pt-2 text-[13px] text-red-500">Hasła nie są takie same.</p>}
              <motion.button
                type="submit"
                whileTap={{ scale: 0.97 }}
                disabled={busy || !canSubmit}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-[14px] bg-accent py-3.5 text-[16px] font-semibold text-white transition-opacity disabled:opacity-40"
              >
                {busy && <SpinnerIcon />}
                Zapisz nowe hasło
              </motion.button>
            </form>
          ) : null}

          {error && <p className="pt-3 text-center text-[14px] text-red-500">{error}</p>}

          {ready === false && (
            <button type="button" onClick={onDone} className="mt-4 block w-full text-center text-[15px] font-semibold text-accent">
              Wróć do logowania
            </button>
          )}
        </motion.div>
      </div>
    </div>
  )
}
