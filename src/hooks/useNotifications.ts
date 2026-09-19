import { useCallback, useEffect, useState } from 'react'
import type { AppNotification } from '@/types/recipe'
import { backend } from '@/lib/data'

/**
 * Aktywność na żywo: liczba nieprzeczytanych (znaczek na pasku zakładek) i najnowsze powiadomienie
 * (do krótkiego banera). Nowe zdarzenia przychodzą z Realtime; po powrocie do aplikacji z tła
 * licznik pobieramy od nowa, bo połączenie mogło się w międzyczasie zerwać.
 */
export function useNotifications(userId: string) {
  const [unread, setUnread] = useState(0)
  const [latest, setLatest] = useState<AppNotification | null>(null)
  /** Rośnie z każdym nowym powiadomieniem — ekran aktywności odświeża po nim listę */
  const [arrivals, setArrivals] = useState(0)

  const refresh = useCallback(async () => {
    try {
      setUnread(await backend.countUnreadNotifications())
    } catch {
      /* brak migracji lub sieci — znaczek po prostu się nie pokazuje */
    }
  }, [])

  useEffect(() => {
    void refresh()
    const onVisible = () => document.visibilityState === 'visible' && void refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refresh])

  useEffect(() => {
    let stop: (() => void) | undefined
    try {
      stop = backend.subscribeNotifications(userId, () => {
        setArrivals((n) => n + 1)
        void refresh()
        backend
          .listNotifications(0, 1)
          .then(([first]) => first && !first.read && setLatest(first))
          .catch(() => {})
      })
    } catch {
      /* Realtime niedostępny — zostaje odświeżanie po powrocie do aplikacji */
    }
    return () => stop?.()
  }, [userId, refresh])

  const markRead = useCallback(async () => {
    setUnread(0)
    try {
      await backend.markNotificationsRead()
    } catch {
      void refresh()
    }
  }, [refresh])

  const dismissLatest = useCallback(() => setLatest(null), [])

  return { unread, latest, arrivals, markRead, dismissLatest }
}
