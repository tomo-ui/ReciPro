/** Proste zdarzenia między zakładkami (np. „zmieniono obserwowanych” → feed pobiera dane od nowa) */
const bus = new EventTarget()

export function emit(name: 'follows-changed'): void {
  bus.dispatchEvent(new Event(name))
}

export function on(name: 'follows-changed', handler: () => void): () => void {
  bus.addEventListener(name, handler)
  return () => bus.removeEventListener(name, handler)
}
