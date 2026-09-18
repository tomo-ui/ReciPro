import { useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import type { Profile } from '@/types/recipe'
import { backend } from '@/lib/data'
import { normalizeFullName } from '@/lib/username'
import { useUsernameCheck } from '@/hooks/useUsernameCheck'
import { Group } from '@/components/formParts'
import { SpinnerIcon } from '@/components/Icons'
import { UsernameInput } from '@/components/UsernameInput'

interface Props {
  prefill?: { username?: string; full_name?: string }
  onDone: (me: Profile) => void
  onSignOut?: () => void
}

/** Wybór nazwy użytkownika — dla kont bez profilu (np. założonych, zanim pojawiły się profile) */
export function ProfileSetupScreen({ prefill, onDone, onSignOut }: Props) {
  const [username, setUsername] = useState(prefill?.username ?? '')
  const [fullName, setFullName] = useState(prefill?.full_name ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const status = useUsernameCheck(username)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (status.state !== 'ok' || busy) return
    setBusy(true)
    setError(null)
    try {
      onDone(await backend.createProfile(username, normalizeFullName(fullName)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się zapisać profilu.')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-bg px-6 pt-safe-top pb-safe-bottom">
      <motion.form
        onSubmit={submit}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm space-y-4"
      >
        <div className="text-center">
          <h1 className="text-[28px] font-bold tracking-tight">Twój profil</h1>
          <p className="mt-1 text-[15px] text-label-2">Wybierz nazwę użytkownika. Po niej inni znajdą Twoje przepisy.</p>
        </div>

        <Group>
          <UsernameInput value={username} onChange={setUsername} status={status} autoFocus />
        </Group>
        <Group>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Imię i nazwisko (opcjonalnie)"
            maxLength={60}
            autoComplete="name"
            className="w-full bg-transparent px-4 py-3.5 outline-none placeholder:text-label-3"
          />
        </Group>
        <p className="px-1 text-[13px] text-label-2">
          Imię i nazwisko ułatwia znajomym znalezienie Cię w wyszukiwarce. Możesz je zmienić w każdej chwili.
        </p>

        <motion.button
          type="submit"
          whileTap={{ scale: 0.97 }}
          disabled={busy || status.state !== 'ok'}
          className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-accent py-3.5 text-[16px] font-semibold text-white transition-opacity disabled:opacity-40"
        >
          {busy && <SpinnerIcon />}
          Zapisz i przejdź dalej
        </motion.button>

        {error && <p className="text-center text-[14px] text-red-500">{error}</p>}
        {onSignOut && (
          <button type="button" onClick={onSignOut} className="block w-full text-center text-[14px] text-label-2">
            Wyloguj się
          </button>
        )}
      </motion.form>
    </div>
  )
}
