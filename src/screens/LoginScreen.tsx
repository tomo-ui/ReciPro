import { useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { SegmentedControl } from '@/components/SegmentedControl'
import { SpinnerIcon } from '@/components/Icons'

type Mode = 'signin' | 'signup'

const MIN_PASSWORD = 8

function friendlyError(message: string, status?: number, code?: string): string {
  if (/invalid login credentials/i.test(message)) return 'Nieprawidłowy e-mail lub hasło.'
  if (/already registered|already been registered/i.test(message)) {
    return 'Konto z tym adresem już istnieje. Przełącz na „Logowanie”.'
  }
  if (code === 'over_email_send_rate_limit' || status === 429 || /rate limit|too many/i.test(message)) {
    return 'Zbyt wiele prób lub maili. Odczekaj chwilę i spróbuj ponownie.'
  }
  if (/email not confirmed/i.test(message)) return 'Adres e-mail nie został jeszcze potwierdzony. Kliknij link w mailu.'
  if (/signups? not allowed|signup.*disabled/i.test(message)) return 'Rejestracja nowych kont jest wyłączona.'
  if (code === 'weak_password' || /password should|weak/i.test(message)) {
    return `Hasło jest zbyt słabe (min. ${MIN_PASSWORD} znaków).`
  }
  if (/invalid.*email|unable to validate email/i.test(message)) return 'Podaj poprawny adres e-mail.'
  return message
}

/** Logowanie i rejestracja e-mail + hasło (Supabase Auth) */
export function LoginScreen() {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const signup = mode === 'signup'
  const canSubmit = email.includes('@') && (signup ? password.length >= MIN_PASSWORD : password.length > 0)

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setNotice(null)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!supabase || !canSubmit) return
    setBusy(true)
    setError(null)
    setNotice(null)

    const creds = { email: email.trim(), password }
    if (signup) {
      const { data, error } = await supabase.auth.signUp({
        ...creds,
        // Adres musi być na liście Redirect URLs w Supabase (Authentication → URL Configuration)
        options: { emailRedirectTo: window.location.origin },
      })
      setBusy(false)
      if (error) return setError(friendlyError(error.message, error.status, error.code))
      // Sesja od razu = potwierdzanie maili wyłączone w Supabase, App sam przełączy ekran.
      // Bez sesji: czekamy na link z maila. Komunikat celowo neutralny — przy już istniejącym
      // adresie Supabase nie zdradza tego w odpowiedzi (ochrona przed zgadywaniem kont).
      if (!data.session) {
        setNotice('Sprawdź skrzynkę: jeśli adres nie był jeszcze zarejestrowany, wysłaliśmy link potwierdzający. Po kliknięciu wróć tu i zaloguj się.')
        setMode('signin')
      }
      return
    }

    const { error } = await supabase.auth.signInWithPassword(creds)
    setBusy(false)
    if (error) setError(friendlyError(error.message, error.status, error.code))
  }

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-bg px-8 pt-safe-top pb-safe-bottom">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
        <img src="/pwa-192x192.png" alt="" className="mx-auto mb-6 h-20 w-20 rounded-[22px] shadow-lg" />
        <h1 className="text-center text-[28px] font-bold tracking-tight">Przepisy</h1>
        <p className="mt-1 mb-6 text-center text-[15px] text-label-2">
          {signup ? 'Załóż konto, żeby zapisywać przepisy w chmurze.' : 'Zaloguj się, żeby synchronizować przepisy.'}
        </p>

        <div className="mb-4">
          <SegmentedControl<Mode>
            value={mode}
            onChange={switchMode}
            options={[
              { value: 'signin', label: 'Logowanie' },
              { value: 'signup', label: 'Rejestracja' },
            ]}
          />
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div className="divide-y divide-separator overflow-hidden rounded-[14px] bg-surface">
            <input
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="adres e-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-transparent px-4 py-3.5 outline-none placeholder:text-label-3"
            />
            <input
              type="password"
              autoComplete={signup ? 'new-password' : 'current-password'}
              placeholder={signup ? `hasło (min. ${MIN_PASSWORD} znaków)` : 'hasło'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-transparent px-4 py-3.5 outline-none placeholder:text-label-3"
            />
          </div>

          <motion.button
            type="submit"
            whileTap={{ scale: 0.97 }}
            disabled={busy || !canSubmit}
            className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-accent py-3.5 text-[16px] font-semibold text-white transition-opacity disabled:opacity-40"
          >
            {busy && <SpinnerIcon />}
            {signup ? 'Załóż konto' : 'Zaloguj'}
          </motion.button>
        </form>

        <AnimatePresence>
          {(error || notice) && (
            <motion.p
              key={error ?? notice}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className={`overflow-hidden pt-3 text-center text-[14px] ${error ? 'text-red-500' : 'text-label-2'}`}
            >
              {error ?? notice}
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
