/**
 * Nazwa użytkownika — te same zasady co na Instagramie (i w bazie: public.is_valid_username):
 *  • 1–30 znaków, litery a–z (wielkość liter bez znaczenia), cyfry, kropka i podkreślnik,
 *  • kropka nie może być na początku, na końcu ani dwie pod rząd,
 *  • nazwa zajęta przez kogoś innego jest niedostępna, a kilka nazw jest zarezerwowanych.
 */

export const USERNAME_MAX = 30

const FORMAT = /^[a-z0-9_]([a-z0-9_.]{0,28}[a-z0-9_])?$/

/** Nazwy zarezerwowane dla aplikacji — muszą się zgadzać z listą w supabase/social.sql */
export const RESERVED_USERNAMES = [
  'admin', 'administrator', 'api', 'root', 'support', 'help', 'settings', 'explore', 'feed',
  'search', 'profile', 'profiles', 'przepisy', 'recipe', 'recipes', 'null', 'undefined',
]

/** Nazwy zapisujemy małymi literami (jak Instagram); spacje z brzegów są ignorowane */
export const normalizeUsername = (raw: string): string => raw.trim().toLowerCase()

/** Zwraca komunikat o błędzie po polsku albo null, gdy nazwa jest poprawna */
export function validateUsername(raw: string): string | null {
  const u = normalizeUsername(raw)
  if (u.length === 0) return 'Wpisz nazwę użytkownika.'
  if (u.length > USERNAME_MAX) return `Nazwa może mieć najwyżej ${USERNAME_MAX} znaków.`
  if (/\s/.test(u)) return 'Nazwa nie może zawierać spacji.'
  if (!/^[a-z0-9_.]+$/.test(u)) return 'Dozwolone są tylko litery a–z (bez polskich znaków), cyfry, kropka i podkreślnik.'
  if (u.startsWith('.')) return 'Nazwa nie może zaczynać się od kropki.'
  if (u.endsWith('.')) return 'Nazwa nie może kończyć się kropką.'
  if (u.includes('..')) return 'Nazwa nie może zawierać dwóch kropek pod rząd.'
  if (RESERVED_USERNAMES.includes(u)) return 'Ta nazwa jest zarezerwowana.'
  return FORMAT.test(u) ? null : 'Nazwa użytkownika jest niepoprawna.'
}

export const isValidUsername = (raw: string): boolean => validateUsername(raw) === null

/** Imię i nazwisko: opcjonalne, do 60 znaków, spacje z brzegów i wielokrotne spacje usuwamy */
export function normalizeFullName(raw: string): string | undefined {
  const t = raw.replace(/\s+/g, ' ').trim()
  return t ? t.slice(0, 60) : undefined
}
