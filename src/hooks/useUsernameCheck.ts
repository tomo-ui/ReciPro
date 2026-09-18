import { useEffect, useState } from 'react'
import { backend } from '@/lib/data'
import { normalizeUsername, validateUsername } from '@/lib/username'

export type UsernameStatus =
  | { state: 'empty' }
  | { state: 'invalid'; message: string }
  | { state: 'checking' }
  | { state: 'taken' }
  | { state: 'ok' }
  | { state: 'error'; message: string }

/**
 * Sprawdza nazwę użytkownika w trakcie wpisywania: najpierw reguły (od razu), potem dostępność w bazie
 * (z opóźnieniem). `current` to nazwa, którą użytkownik już ma (przy edycji profilu) — jest zawsze „ok”.
 */
export function useUsernameCheck(value: string, current?: string): UsernameStatus {
  const [status, setStatus] = useState<UsernameStatus>({ state: 'empty' })

  useEffect(() => {
    const u = normalizeUsername(value)
    if (!u) return setStatus({ state: 'empty' })
    const invalid = validateUsername(u)
    if (invalid) return setStatus({ state: 'invalid', message: invalid })
    if (current && u === current) return setStatus({ state: 'ok' })

    setStatus({ state: 'checking' })
    let alive = true
    const t = setTimeout(() => {
      backend
        .usernameAvailable(u)
        .then((free) => alive && setStatus({ state: free ? 'ok' : 'taken' }))
        .catch((e: unknown) => alive && setStatus({ state: 'error', message: e instanceof Error ? e.message : 'Nie udało się sprawdzić nazwy.' }))
    }, 400)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [value, current])

  return status
}
