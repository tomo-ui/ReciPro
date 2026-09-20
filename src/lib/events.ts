/** Proste zdarzenia między zakładkami (np. „zmieniono obserwowanych” → feed pobiera dane od nowa) */
const bus = new EventTarget()

export type AppEvent = 'follows-changed' | 'notifications-changed' | 'comments-changed' | 'interests-changed' | 'visibility-changed'

export function emit(name: AppEvent): void {
  bus.dispatchEvent(new Event(name))
}

export function on(name: AppEvent, handler: () => void): () => void {
  bus.addEventListener(name, handler)
  return () => bus.removeEventListener(name, handler)
}
