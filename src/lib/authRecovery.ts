import { supabase } from './supabase'

interface RecoveryResult {
  tokens: { access_token: string; refresh_token: string } | null
  error: string | null
}

/**
 * Supabase odsyła z maila resetu hasła z tokenami w hashu (#access_token=…&refresh_token=…&type=recovery)
 * albo z błędem (#error=…&type=recovery — link wygasł/już użyty). Czytamy to raz przy załadowaniu modułu
 * (przed Reactem), tak samo jak istniejący `redirectResult` w LoginScreen.tsx dla potwierdzenia e-maila —
 * ale to jest osobny plik, bo App.tsx musi to sprawdzić ZANIM w ogóle zdecyduje, czy pokazać LoginScreen.
 * `detectSessionInUrl` w lib/supabase.ts zostaje wyłączone (PWA na iOS), więc sesję z tokenów budujemy
 * ręcznie przez `setSession`, a nie automatyczną detekcją Supabase.
 */
const parsed = ((): RecoveryResult => {
  if (typeof window === 'undefined') return { tokens: null, error: null }
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  if (h.get('type') !== 'recovery') return { tokens: null, error: null }
  history.replaceState(null, '', window.location.pathname + window.location.search)

  if (h.has('error')) {
    return {
      tokens: null,
      error:
        h.get('error_code') === 'otp_expired'
          ? 'Link do resetu hasła wygasł albo już z niego skorzystano. Poproś o nowy z ekranu logowania.'
          : (h.get('error_description') ?? 'Nie udało się otworzyć linku do resetu hasła.'),
    }
  }
  const access_token = h.get('access_token')
  const refresh_token = h.get('refresh_token')
  if (!access_token || !refresh_token) return { tokens: null, error: 'Nieprawidłowy link do resetu hasła.' }
  return { tokens: { access_token, refresh_token }, error: null }
})()

/** Czy w ogóle jesteśmy w trybie resetu hasła (sukces albo błąd) — App.tsx pomija normalny ekran logowania/feed */
export const isPasswordRecovery = parsed.tokens !== null || parsed.error !== null
export const recoveryError = parsed.error

/** Ustawia sesję z tokenów linku; `false` = link nie zadziałał (np. wygasł), mimo że wyglądał poprawnie */
export const recoverySessionReady: Promise<boolean> =
  parsed.tokens && supabase ? supabase.auth.setSession(parsed.tokens).then(({ error }) => !error) : Promise.resolve(false)
