import { useCallback, useEffect, useState } from 'react'
import { backend } from '@/lib/data'

/**
 * Zgoda na przetwarzanie importowanych treści przez zewnętrzne AI (Apple 5.1.2(i), RODO).
 * `granted`: null = jeszcze sprawdzamy, false = brak zgody, true = jest. Zapis idzie do bazy (supabase/consent_limits.sql);
 * ten sam stan sprawdza serwer przy każdym imporcie (api/parse-recipe.ts), więc ukrycie okna w interfejsie niczego nie omija.
 */
export function useAiConsent() {
  const [granted, setGranted] = useState<boolean | null>(null)

  useEffect(() => {
    let alive = true
    backend
      .getAiConsent()
      .then((v) => alive && setGranted(v))
      .catch(() => alive && setGranted(false))
    return () => {
      alive = false
    }
  }, [])

  const set = useCallback(async (value: boolean) => {
    await backend.setAiConsent(value)
    setGranted(value)
  }, [])

  /** Serwer odmówił, bo zgody nie ma (np. cofnięta na innym urządzeniu) — wracamy do stanu „brak zgody” */
  const markMissing = useCallback(() => setGranted(false), [])

  return { granted, set, markMissing }
}
