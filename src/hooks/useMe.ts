import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Profile } from '@/types/recipe'
import { backend } from '@/lib/data'
import { validateUsername } from '@/lib/username'

interface State {
  status: 'loading' | 'ready' | 'error'
  me: Profile | null
  error?: string
  /** Auto-zakładanie profilu z kodu zaproszenia w metadanych się nie powiodło — pokazane od razu na ekranie wyboru nazwy */
  setupError?: string
}

/**
 * Profil zalogowanego użytkownika. Jeśli go jeszcze nie ma, a konto powstało z formularza
 * rejestracji z nazwą użytkownika (zapisaną w metadanych konta), zakładamy profil automatycznie.
 * Gdy to się nie uda (nazwa w międzyczasie zajęta, konto założone przed wprowadzeniem profili),
 * `me` zostaje null i aplikacja pokazuje ekran wyboru nazwy.
 */
export function useMe(session: Session | null) {
  const [state, setState] = useState<State>({ status: 'loading', me: null })
  const userId = session?.user.id

  const load = useCallback(async () => {
    setState({ status: 'loading', me: null })
    try {
      let me = await backend.getMyProfile()
      let setupError: string | undefined
      if (!me && session) {
        const meta = session.user.user_metadata as { username?: string; full_name?: string; invite_code?: string } | undefined
        if (meta?.username && validateUsername(meta.username) === null && (await backend.usernameAvailable(meta.username))) {
          try {
            me = await backend.createProfile(meta.username, meta.full_name, meta.invite_code)
          } catch (e) {
            // Zła nazwa w wyścigu: cicho, użytkownik wybierze nową. Zły kod zaproszenia: pokazujemy powód od razu.
            if (e instanceof Error && /kod zaproszenia/i.test(e.message)) setupError = e.message
          }
        }
      }
      setState({ status: 'ready', me, setupError })
    } catch (e) {
      setState({ status: 'error', me: null, error: e instanceof Error ? e.message : 'Nie udało się wczytać profilu.' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  useEffect(() => {
    load()
  }, [load])

  const setMe = useCallback((me: Profile) => setState({ status: 'ready', me }), [])
  return { ...state, reload: load, setMe }
}
