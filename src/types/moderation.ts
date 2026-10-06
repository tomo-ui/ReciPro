/** Zgłaszanie treści, blokowanie użytkowników i panel moderacji (patrz supabase/moderation.sql) */

export type ReportTargetType = 'recipe' | 'comment' | 'profile'

export type ReportReason = 'spam' | 'offensive' | 'copyright' | 'inappropriate' | 'other'

export const REPORT_REASONS: { value: ReportReason; label: string; hint: string }[] = [
  { value: 'spam', label: 'Spam lub reklama', hint: 'Niechciane reklamy, powtarzające się lub wprowadzające w błąd treści.' },
  { value: 'offensive', label: 'Obraźliwe lub nienawistne', hint: 'Wyzwiska, nękanie, groźby, mowa nienawiści.' },
  { value: 'copyright', label: 'Narusza moje prawa autorskie', hint: 'Skopiowany przepis, zdjęcie lub opis, do którego nie ma praw.' },
  { value: 'inappropriate', label: 'Nieodpowiednia treść', hint: 'Treści seksualne, przemoc, niebezpieczne porady.' },
  { value: 'other', label: 'Inny powód', hint: 'Opisz, o co chodzi.' },
]

export const reportReasonLabel = (reason: ReportReason): string => REPORT_REASONS.find((r) => r.value === reason)?.label ?? reason

/** Czego dotyczy zgłoszenie: rodzaj i id treści (przepis, komentarz albo profil = id użytkownika) */
export interface ReportTarget {
  type: ReportTargetType
  id: string
}

/** Osoba zablokowana przeze mnie (Ustawienia → Prywatność i bezpieczeństwo → Zablokowani) */
export interface BlockedUser {
  id: string
  username: string
  full_name?: string
  avatar_url?: string
  blocked_at: string
}

export type ReportStatus = 'open' | 'resolved' | 'dismissed'

/** Zgłoszenie widziane przez moderatora */
export interface ModerationReport {
  id: string
  target_type: ReportTargetType
  target_id: string
  /** Autor zgłoszonej treści (brak, gdy konto już usunięto) */
  target_user_id?: string
  target_username?: string
  /** Fragment treści zapisany w chwili zgłoszenia */
  excerpt?: string
  reason: ReportReason
  details?: string
  status: ReportStatus
  /** dismiss | remove_content | remove_account */
  action?: string
  created_at: string
  reporter_username?: string
  /** Ile osób zgłosiło tę samą treść */
  reports_count: number
}

export type ReportResolution = 'dismiss' | 'remove_content'
