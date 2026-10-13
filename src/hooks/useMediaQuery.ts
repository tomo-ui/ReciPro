import { useSyncExternalStore } from 'react'

/** Reaguje na zmianę zapytania CSS (np. zmiana rozmiaru okna); na serwerze i w testach zwraca `false` */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => undefined
      const mq = window.matchMedia(query)
      mq.addEventListener('change', notify)
      return () => mq.removeEventListener('change', notify)
    },
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  )
}

/** Układ komputerowy (przeglądarka na dużym ekranie): od 1024 px — tyle samo co `lg:` w Tailwindzie i `.app-frame` w index.css */
export const DESKTOP_QUERY = '(min-width: 1024px)'
export const useIsDesktop = () => useMediaQuery(DESKTOP_QUERY)
