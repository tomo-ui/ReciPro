import { useCallback, useState } from 'react'
import { loadPrefs, sanitize, savePrefs, type Prefs } from '@/lib/prefs'

/** Cele żywieniowe zapisane na tym urządzeniu; każda zmiana jest naprawiana (zakresy, suma makro) i od razu zapisywana */
export function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs)
  const update = useCallback((patch: Partial<Prefs>) => {
    setPrefs((current) => {
      const next = sanitize({ ...current, ...patch })
      savePrefs(next)
      return next
    })
  }, [])
  return { prefs, update }
}
