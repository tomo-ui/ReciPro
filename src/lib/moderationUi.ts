import type { ReportTarget } from '@/types/moderation'

/**
 * Żądanie otwarcia menu „Zgłoś / Zablokuj” z dowolnego miejsca aplikacji (karta w feedzie, przepis, komentarz, profil).
 * Menu i okno zgłoszenia obsługuje jedna warstwa w App.tsx (components/ModerationLayer.tsx), więc przyciski „…”
 * nie muszą przekazywać wywołań przez kolejne komponenty.
 */
export interface ModerationRequest {
  target: ReportTarget
  /** Autor treści (przy profilu: ten sam użytkownik) — to jego można zablokować */
  userId: string
  username: string
  /** Opis do tytułu menu, np. „Przepis: Sernik babci” */
  label: string
}

type Listener = (req: ModerationRequest) => void
let listener: Listener | null = null

export function openModeration(req: ModerationRequest): void {
  listener?.(req)
}

/** Rejestruje obsługę żądań; zwraca funkcję wyrejestrowującą */
export function onModerationRequest(next: Listener): () => void {
  listener = next
  return () => {
    if (listener === next) listener = null
  }
}
