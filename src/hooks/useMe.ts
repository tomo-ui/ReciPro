import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Profile } from '@/types/recipe'
import { backend } from '@/lib/data'
import { validateUsername } from '@/lib/username'

interface State {
  status: 'loading' | 'ready' | 'error'
  me: Profile | null
  error?: string
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
      if (!me && session) {
        const meta = session.user.user_metadata as { username?: string; full_name?: string } | undefined
        if (meta?.username && validateUsername(meta.username) === null && (await backend.usernameAvailable(meta.username))) {
          try {
            me = await backend.createProfile(meta.username, meta.full_name)
          } catch {
            /* zajęta w wyścigu — użytkownik wybierze nazwę ręcznie */
          }
        }
      }
      setState({ status: 'ready', me })
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
