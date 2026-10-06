/**
 * Strony prawne to statyczne pliki w public/ (otwierają się bez logowania, a sklepy wymagają publicznego adresu).
 * Wersje i data obowiązywania są w nagłówkach samych stron.
 */
export const LEGAL = {
  terms: '/regulamin.html',
  privacy: '/prywatnosc.html',
  deleteAccount: '/usun-konto.html',
} as const

/** Minimalny wiek użytkownika (regulamin i polityka prywatności; Apple/Google: ocena wieku 13+, ale RODO w Polsce wymaga 16 lat do zgody) */
export const MIN_AGE = 16
