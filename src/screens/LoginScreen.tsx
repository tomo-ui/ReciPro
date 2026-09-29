import { useEffect, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { LOGO_TARGET_ID, markAppReady, useLogoLanded } from '@/lib/splash'
import { normalizeFullName, normalizeUsername } from '@/lib/username'
import { useUsernameCheck } from '@/hooks/useUsernameCheck'
import { AppLogo } from '@/components/AppLogo'
import { SegmentedControl } from '@/components/SegmentedControl'
import { SpinnerIcon } from '@/components/Icons'
import { UsernameInput } from '@/components/UsernameInput'

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

/**
 * Supabase odsyła z maila na adres aplikacji z wynikiem w hashu (#error=… albo #access_token=…).
 * Czytamy to raz przy załadowaniu modułu (przed Reactem, odporne na podwójne renderowanie w StrictMode)
 * i czyścimy hash, żeby tokeny nie zostawały w pasku adresu.
 */
const redirectResult = ((): { error?: string; notice?: string } => {
  if (typeof window === 'undefined') return {}
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  if (h.get('type') === 'recovery') return {} // link resetu hasła — obsługuje go osobno lib/authRecovery.ts
  if (!h.has('error') && !h.has('access_token')) return {}
  history.replaceState(null, '', window.location.pathname + window.location.search)
  if (h.get('error_code') === 'otp_expired') {
    return {
      error:
        'Link potwierdzający wygasł lub został już użyty. Spróbuj się zalogować — jeśli konto nie jest potwierdzone, wyślemy nowy link.',
    }
  }
  if (h.has('error')) return { error: h.get('error_description') ?? 'Nie udało się potwierdzić adresu e-mail.' }
  return { notice: 'Adres e-mail potwierdzony. Zaloguj się.' }
})()

/** Logowanie i rejestracja e-mail + hasło (Supabase Auth) */
export function LoginScreen() {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  // Logo z ekranu startowego wskakuje w to miejsce; do tej chwili jest ukryte. Dotknięcie odtwarza mrugnięcie.
  const landed = useLogoLanded()
  const [wink, setWink] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(redirectResult.error ?? null)
  const [notice, setNotice] = useState<string | null>(redirectResult.notice ?? null)
  const [unconfirmed, setUnconfirmed] = useState(false)

  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [inviteCode, setInviteCode] = useState('')

  // Logowanie odbywa się nazwą użytkownika (nie e-mailem) — osobne pole/stan od `username` rejestracji,
  // bo to pole nie jest sprawdzane pod kątem reguł/dostępności jak przy zakładaniu konta
  const [loginUsername, setLoginUsername] = useState('')
  const [forgot, setForgot] = useState(false)
  const [forgotUsername, setForgotUsername] = useState('')
  const [forgotBusy, setForgotBusy] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)

  useEffect(() => markAppReady(), [])

  const signup = mode === 'signup'
  const mismatch = signup && password2.length > 0 && password2 !== password
  // Nazwa użytkownika jest sprawdzana (reguły + dostępność) tylko w trybie rejestracji
  const usernameStatus = useUsernameCheck(signup ? username : '')
  const canSubmit = signup
    ? email.includes('@') && password.length >= MIN_PASSWORD && password2 === password && usernameStatus.state === 'ok' && inviteCode.trim().length === 5
    : loginUsername.trim().length > 0 && password.length > 0

  function switchMode(next: Mode) {
    setMode(next)
    setPassword2('')
    setError(null)
    setNotice(null)
    setUnconfirmed(false)
  }

  async function submitForgot(e: FormEvent) {
    e.preventDefault()
    if (!forgotUsername.trim() || forgotBusy) return
    setForgotBusy(true)
    try {
      // Tłumaczenie nazwy na e-mail i wysyłkę linku robi serwer (api/forgot-password.ts) —
      // e-mail nigdy nie trafia do przeglądarki. Odpowiedź jest zawsze taka sama.
      await fetch('/api/forgot-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: forgotUsername }),
      })
    } catch {
      /* nic — komunikat niżej jest celowo neutralny, żeby nie zdradzać istnienia konta */
    } finally {
      setForgotBusy(false)
      setForgotSent(true)
    }
  }

  async function resendConfirmation() {
    if (!supabase || !email.includes('@')) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    })
    setBusy(false)
    if (error) return setError(friendlyError(error.message, error.status, error.code))
    setUnconfirmed(false)
    setNotice('Wysłaliśmy nowy link potwierdzający. Kliknij go od razu po otrzymaniu — jest ważny krótko i działa tylko raz.')
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!supabase || !canSubmit) return
    setBusy(true)
    setError(null)
    setNotice(null)

    if (signup) {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          // Adres musi być na liście Redirect URLs w Supabase (Authentication → URL Configuration)
          emailRedirectTo: window.location.origin,
          // Nazwa trafia do metadanych konta; profil powstaje przy pierwszym zalogowaniu (useMe),
          // bo przy włączonym potwierdzaniu maili nie ma jeszcze sesji, która pozwoliłaby go zapisać
          data: {
            username: normalizeUsername(username),
            full_name: normalizeFullName(fullName) ?? '',
            invite_code: inviteCode.trim().toUpperCase(),
          },
        },
      })
      setBusy(false)
      if (error) return setError(friendlyError(error.message, error.status, error.code))
      // Sesja od razu = potwierdzanie maili wyłączone w Supabase, App sam przełączy ekran.
      // Bez sesji: czekamy na link z maila. Komunikat celowo neutralny — przy już istniejącym
      // adresie Supabase nie zdradza tego w odpowiedzi (ochrona przed zgadywaniem kont).
      if (!data.session) {
        setNotice('Sprawdź skrzynkę: jeśli adres nie był jeszcze zarejestrowany, wysłaliśmy link potwierdzający. Po kliknięciu wróć tu i zaloguj się.')
        setMode('signin')
        setPassword2('')
      }
      return
    }

    // Logowanie nazwą użytkownika: tłumaczenie na e-mail i samo logowanie robi serwer
    // (api/login.ts, klucz service_role) — e-mail nigdy nie trafia do przeglądarki.
    let loginRes: Response
    try {
      loginRes = await fetch('/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password }),
      })
    } catch {
      setBusy(false)
      return setError('Nie udało się połączyć z serwerem. Spróbuj ponownie.')
    }
    const body = (await loginRes.json().catch(() => null)) as { access_token?: string; refresh_token?: string; error?: string; code?: string } | null
    if (!loginRes.ok || !body?.access_token || !body.refresh_token) {
      setBusy(false)
      setUnconfirmed(body?.code === 'email_not_confirmed')
      return setError(body?.code === 'email_not_confirmed' ? friendlyError(body.error ?? '') : (body?.error ?? 'Nieprawidłowa nazwa użytkownika lub hasło.'))
    }

    const { error } = await supabase.auth.setSession({ access_token: body.access_token, refresh_token: body.refresh_token })
    setBusy(false)
    if (error) setError(error.message)
  }

  return (
    <div className="scroll-y fixed inset-0 bg-bg px-8 pt-safe-top pb-safe-bottom">
      <div className="flex min-h-full flex-col items-center justify-center py-8">
      {/* Bez przesunięcia przy wejściu: ekran startowy mierzy położenie logo i wskakuje dokładnie tutaj */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-sm">
        <div id={LOGO_TARGET_ID} className="mx-auto mb-6 h-20 w-20" style={{ visibility: landed ? 'visible' : 'hidden' }}>
          <button type="button" onClick={() => setWink((n) => n + 1)} tabIndex={-1} aria-hidden className="block rounded-[22.37%]">
            <AppLogo key={wink} size={80} play={wink > 0} />
          </button>
        </div>
        <h1 className="text-center text-[28px] font-bold tracking-tight">Przepisy</h1>
        <p className="mt-1 mb-6 text-center text-[15px] text-label-2">
          {forgot ? 'Ustaw nowe hasło.' : signup ? 'Załóż konto, żeby zapisywać przepisy w chmurze.' : 'Zaloguj się, żeby synchronizować przepisy.'}
        </p>

        {forgot ? (
          <div>
            {forgotSent ? (
              <p className="text-center text-[14px] text-label-2">
                Jeśli konto o tej nazwie istnieje, wysłaliśmy link na powiązany adres e-mail. Otwórz go, ustaw nowe hasło, a potem wróć tu i zaloguj się.
              </p>
            ) : (
              <form onSubmit={submitForgot}>
                <p className="mb-3 text-center text-[13px] text-label-2">
                  Podaj nazwę użytkownika — jeśli konto istnieje, wyślemy link do ustawienia nowego hasła.
                </p>
                <div className="overflow-hidden rounded-[14px] bg-surface">
                  <input
                    value={forgotUsername}
                    onChange={(e) => setForgotUsername(e.target.value)}
                    placeholder="nazwa użytkownika"
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="username"
                    className="w-full bg-transparent px-4 py-3.5 outline-none placeholder:text-label-3"
                  />
                </div>
                <motion.button
                  type="submit"
                  whileTap={{ scale: 0.97 }}
                  disabled={forgotBusy || !forgotUsername.trim()}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-[14px] bg-accent py-3.5 text-[16px] font-semibold text-white transition-opacity disabled:opacity-40"
                >
                  {forgotBusy && <SpinnerIcon />}
                  Wyślij link
                </motion.button>
              </form>
            )}
            <button
              type="button"
              onClick={() => {
                setForgot(false)
                setForgotSent(false)
                setForgotUsername('')
              }}
              className="mt-4 block w-full text-center text-[15px] font-semibold text-accent"
            >
              Wróć do logowania
            </button>
          </div>
        ) : (
          <>
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

        <form onSubmit={submit}>
          {/* Pola rejestracji rozwijają się i zwijają tą samą animacją przy zmianie zakładki */}
          <AnimatePresence initial={false}>
            {signup && (
              <motion.div
                key="signup-fields"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ type: 'spring', stiffness: 380, damping: 38 }}
                // odstęp pod polami jest wewnątrz animowanego bloku, więc znika płynnie razem z nim
                style={{ marginTop: 0 }}
                className="overflow-hidden"
              >
                <div className="space-y-3 pb-3">
                  <div className="overflow-hidden rounded-[14px] bg-surface">
                    <input
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value.toUpperCase().slice(0, 5))}
                      placeholder="kod zaproszenia"
                      maxLength={5}
                      autoCapitalize="characters"
                      autoCorrect="off"
                      autoComplete="off"
                      className="w-full bg-transparent px-4 py-3.5 text-center font-mono text-[17px] font-bold tracking-[0.3em] outline-none placeholder:font-sans placeholder:text-[16px] placeholder:font-normal placeholder:tracking-normal placeholder:text-label-3"
                    />
                  </div>
                  <div className="overflow-hidden rounded-[14px] bg-surface">
                    <UsernameInput value={username} onChange={setUsername} status={usernameStatus} />
                  </div>
                  <div className="overflow-hidden rounded-[14px] bg-surface">
                    <input
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="imię i nazwisko (opcjonalnie)"
                      maxLength={60}
                      autoComplete="name"
                      className="w-full bg-transparent px-4 py-3.5 outline-none placeholder:text-label-3"
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="overflow-hidden rounded-[14px] bg-surface">
            {signup ? (
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="adres e-mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-transparent px-4 py-3.5 outline-none placeholder:text-label-3"
              />
            ) : (
              <input
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="nazwa użytkownika"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                className="w-full bg-transparent px-4 py-3.5 outline-none placeholder:text-label-3"
              />
            )}
            <input
              type="password"
              autoComplete={signup ? 'new-password' : 'current-password'}
              placeholder={signup ? `hasło (min. ${MIN_PASSWORD} znaków)` : 'hasło'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border-t border-separator bg-transparent px-4 py-3.5 outline-none placeholder:text-label-3"
            />
            <AnimatePresence initial={false}>
              {signup && (
                <motion.div
                  key="password-repeat"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 38 }}
                  className="overflow-hidden"
                >
                  <input
                    type="password"
                    autoComplete="new-password"
                    placeholder="powtórz hasło"
                    value={password2}
                    onChange={(e) => setPassword2(e.target.value)}
                    aria-invalid={mismatch}
                    className="w-full border-t border-separator bg-transparent px-4 py-3.5 outline-none placeholder:text-label-3"
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <AnimatePresence initial={false}>
            {mismatch && (
              <motion.p
                key="mismatch"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden px-4 pt-2 text-[13px] text-red-500"
                aria-live="polite"
              >
                Hasła nie są takie same.
              </motion.p>
            )}
          </AnimatePresence>

          {!signup && (
            <button type="button" onClick={() => setForgot(true)} className="mt-2 block w-full text-right text-[13px] font-medium text-accent">
              Nie pamiętam hasła
            </button>
          )}

          <motion.button
            type="submit"
            whileTap={{ scale: 0.97 }}
            disabled={busy || !canSubmit}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-[14px] bg-accent py-3.5 text-[16px] font-semibold text-white transition-opacity disabled:opacity-40"
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

        {unconfirmed && (
          <button
            type="button"
            onClick={resendConfirmation}
            disabled={busy}
            className="mt-2 w-full text-center text-[15px] font-semibold text-accent disabled:opacity-40"
          >
            Wyślij link ponownie
          </button>
        )}
          </>
        )}
      </motion.div>
      </div>
    </div>
  )
}
