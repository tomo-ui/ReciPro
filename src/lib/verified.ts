/**
 * Złoty znaczek weryfikacji: konto twórcy aplikacji. Rozpoznajemy je po nazwie użytkownika.
 * Nazwa jest unikalna, więc dopóki właściciel konta jej nie zmieni, znaczek zostaje przy nim.
 * (Trwalsze rozwiązanie to flaga w tabeli profiles ustawiana tylko po stronie bazy.)
 */
export const CREATOR_USERNAME = 'tk'

export const isCreator = (username?: string | null): boolean => !!username && username.toLowerCase() === CREATOR_USERNAME
