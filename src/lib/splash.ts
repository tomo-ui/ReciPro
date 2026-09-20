import { useSyncExternalStore } from 'react'

/**
 * Stan ekranu startowego (components/Splash.tsx): aplikacja zgłasza, że jest gotowa do pokazania
 * (sprawdzona sesja i profil albo ekran logowania), a ekran startowy oddaje logo na jego miejsce.
 */
interface State {
  ready: boolean
  /** Logo wylądowało na swoim miejscu (albo ekran startowy nie jest już potrzebny) */
  landed: boolean
}

let state: State = { ready: false, landed: false }
const listeners = new Set<() => void>()

function set(patch: Partial<State>) {
  const next = { ...state, ...patch }
  if (next.ready === state.ready && next.landed === state.landed) return
  state = next
  listeners.forEach((l) => l())
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const markAppReady = () => set({ ready: true })
export const markLogoLanded = () => set({ landed: true })

export const useAppReady = () => useSyncExternalStore(subscribe, () => state.ready)
export const useLogoLanded = () => useSyncExternalStore(subscribe, () => state.landed)

/** Identyfikator elementu, w które ma wskoczyć logo z ekranu startowego (ekran logowania) */
export const LOGO_TARGET_ID = 'app-logo-target'
