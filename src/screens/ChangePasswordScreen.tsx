import { useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { SpinnerIcon } from '@/components/Icons'

const MIN_PASSWORD = 8

interface Props {
  onClose: () => void
}

/** Zmiana hasła z poziomu Ustawień, dla już zalogowanego użytkownika */
export function ChangePasswordScreen({ onClose }: Props) {
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const mismatch = password2.length > 0 && password2 !== password
  const canSubmit = password.length >= MIN_PASSWORD && password2 === password

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!supabase || !canSubmit || busy) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) return setError(error.message)
    setDone(true)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-11 shrink-0 items-center justify-between px-4">
        <span className="w-16" />
        <h2 className="text-[17px] font-semibold">Zmień hasło</h2>
        <button onClick={onClose} className="w-16 text-right text-[17px] font-semibold text-accent active:opacity-50">
          Gotowe
        </button>
      </header>
      <div className="scroll-y flex-1 px-4 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+24px)]">
        {done ? (
          <p className="pt-8 text-center text-[15px] text-label-2">Hasło zostało zmienione.</p>
        ) : (
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
            {error && <p className="px-4 pt-2 text-[13px] text-red-500">{error}</p>}
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
        )}
      </div>
    </div>
  )
}
