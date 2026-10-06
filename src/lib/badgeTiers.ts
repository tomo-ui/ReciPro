/** Warianty znaczka weryfikacji — kolor, etykieta i opis w jednym miejscu, żeby nic nie było hardkodowane gdzie indziej */
export type VerifiedBadgeTier = 'blue' | 'gold' | 'pink' | 'purple'

export interface BadgeTierInfo {
  color: string
  /** Co oznacza znaczek (krótko, w tytule panelu i dla czytników ekranu) */
  label: string
  /** Nazwa klasy (koloru) znaczka: „Klasa: Złota” */
  className: string
  /** Wyjaśnienie dla osoby, która dotknęła znaczka na profilu */
  description: string
}

export const BADGE_TIERS: Record<VerifiedBadgeTier, BadgeTierInfo> = {
  blue: {
    color: '#3ba7ff',
    label: 'Zwykła weryfikacja',
    className: 'Niebieska',
    description: 'Zespół ReciPro potwierdził, że to autentyczne konto tej osoby.',
  },
  gold: {
    color: '#f0b429',
    label: 'Twórca aplikacji',
    className: 'Złota',
    description: 'Konto twórcy aplikacji ReciPro.',
  },
  pink: {
    color: '#ff5c9e',
    label: 'Tester aplikacji',
    className: 'Różowa',
    description: 'Osoba, która testuje ReciPro w fazie beta i pomaga ją rozwijać.',
  },
  // etykieta i opis tymczasowe — do zmiany, gdy zostanie ustalone znaczenie tego znaczka
  purple: {
    color: '#9b6bff',
    label: 'Znaczek fioletowy',
    className: 'Fioletowa',
    description: 'Specjalne oznaczenie przyznawane przez zespół ReciPro.',
  },
}
