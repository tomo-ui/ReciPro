import { useState } from 'react'
import { motion } from 'framer-motion'
import { backend } from '@/lib/data'
import { usesSupabase } from '@/lib/supabase'
import { LEGAL } from '@/lib/legal'
import { Group } from './formParts'
import { SpinnerIcon } from './Icons'

interface Props {
  /** Nazwa użytkownika do przepisania na potwierdzenie; brak (konto bez profilu) = tylko przycisk z dodatkowym potwierdzeniem */
  username?: string
}

/**
 * Trwałe usunięcie konta (Apple 5.1.1(v), Google Play): zakres danych, potwierdzenie przepisaniem nazwy i usunięcie
 * przez serwer (api/account.ts). Po sukcesie sesja się kończy, więc aplikacja sama wraca do logowania.
 */
export function DeleteAccountPanel({ username }: Props) {
  const [typed, setTyped] = useState('')
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const confirmed = username ? typed.trim().toLowerCase() === username.toLowerCase() : armed

  async function remove() {
    if (!confirmed || busy) return
    setBusy(true)
    setError(null)
    try {
      await backend.deleteAccount(username ?? '')
      // Konto Supabase: wylogowanie wraca do ekranu logowania samo. Tryb lokalny: czyścimy dane i startujemy od zera.
      if (!usesSupabase) window.location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się usunąć konta. Spróbuj ponownie.')
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-[14px] bg-surface px-4 py-3.5 text-[14px]">
        <p className="font-semibold text-red-500">Tej operacji nie da się cofnąć.</p>
        <p className="mt-1.5 text-label-2">Usuniemy natychmiast i na stałe:</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-label-2">
          <li>konto i profil (nazwa, zdjęcie, opis),</li>
          <li>wszystkie Twoje przepisy — prywatne i opublikowane — wraz ze zdjęciami,</li>
          <li>komentarze, polubienia, obserwowania, powiadomienia, diety i zapisane posiłki.</li>
        </ul>
        <p className="mt-2 text-[13px] text-label-2">
          Kopie Twoich przepisów zapisane przez innych użytkowników zostają u nich, ale bez wskazania Twojego konta.{' '}
          <a href={LEGAL.deleteAccount} target="_blank" rel="noopener noreferrer" className="font-medium text-accent">
            Więcej
          </a>
        </p>
      </div>

      {username ? (
        <div>
          <p className="mb-1.5 px-4 text-[13px] text-label-2 uppercase">Wpisz „{username}”, aby potwierdzić</p>
          <Group>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={username}
              autoCapitalize="none"
              autoCorrect="off"
              aria-label="Nazwa użytkownika"
              className="w-full bg-transparent px-4 py-3.5 outline-none placeholder:text-label-3"
            />
          </Group>
        </div>
      ) : (
        <label className="flex items-start gap-3 px-1 text-[14px]">
          <input type="checkbox" checked={armed} onChange={(e) => setArmed(e.target.checked)} className="mt-1 h-4 w-4" />
          <span>Rozumiem, że konto zostanie usunięte trwale.</span>
        </label>
      )}

      <motion.button
        whileTap={{ scale: 0.97 }}
        disabled={!confirmed || busy}
        onClick={() => void remove()}
        className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-red-500 py-3.5 text-[16px] font-semibold text-white transition-opacity disabled:opacity-35"
      >
        {busy && <SpinnerIcon />}
        Usuń konto na stałe
      </motion.button>
      {error && <p className="px-1 text-center text-[14px] text-red-500">{error}</p>}
    </div>
  )
}
