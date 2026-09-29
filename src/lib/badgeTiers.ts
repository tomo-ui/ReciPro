/** Warianty znaczka weryfikacji — kolor i etykieta w jednym miejscu, żeby nic nie było hardkodowane gdzie indziej */
export type VerifiedBadgeTier = 'blue' | 'gold' | 'pink' | 'purple'

export const BADGE_TIERS: Record<VerifiedBadgeTier, { color: string; label: string }> = {
  blue: { color: '#3ba7ff', label: 'Zwykła weryfikacja' },
  gold: { color: '#f0b429', label: 'Twórca aplikacji' },
  pink: { color: '#ff5c9e', label: 'Tester aplikacji' },
  // etykieta tymczasowa — do zmiany, gdy zostanie ustalone znaczenie tego znaczka
  purple: { color: '#9b6bff', label: 'Znaczek fioletowy' },
}
