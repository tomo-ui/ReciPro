/**
 * Normalizacja tekstu do wyszukiwania: małe litery bez ogonków (ł → l).
 * Odpowiada funkcji SQL public.f_unaccent(lower(...)) z supabase/social.sql.
 */
const combining = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, 'g')

export const fold = (s: string): string => s.toLowerCase().normalize('NFD').replace(combining, '').replace(/ł/g, 'l')
