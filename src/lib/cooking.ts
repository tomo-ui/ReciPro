/** Pomocnicze funkcje trybu gotowania: timery z treści kroków i zegar */

export interface StepTimer {
  /** Fragment tekstu, z którego odczytano czas (np. „10 minut”, „1,5 godziny”) */
  label: string
  seconds: number
}

const MAX_SECONDS = 24 * 3600

/**
 * Czasy w treści kroku, które da się odmierzyć: „10 minut”, „3-4 min”, „1,5 godziny”, „pół godziny”, „30 sekund”.
 * Przy zakresie („3–4 minuty”) bierzemy dolną granicę — lepiej sprawdzić potrawę wcześniej niż ją przypalić.
 * Ten sam czas wspomniany dwa razy w kroku pojawia się raz.
 */
export function findTimers(text: string): StepTimer[] {
  const found: { at: number; timer: StepTimer }[] = []
  const add = (at: number, label: string, seconds: number) => {
    if (seconds >= 5 && seconds <= MAX_SECONDS) found.push({ at, timer: { label: label.trim(), seconds: Math.round(seconds) } })
  }
  const num = (s: string) => Number.parseFloat(s.replace(',', '.'))

  // 10 minut, 3-4 min., 3 do 5 minut
  for (const m of text.matchAll(/(\d+(?:[.,]\d+)?)(?:\s*(?:-|–|—|do)\s*\d+(?:[.,]\d+)?)?\s*(min(?:ut[a-zęy]*|\.)?)(?![\p{L}])/giu)) {
    add(m.index ?? 0, m[0], num(m[1]) * 60)
  }
  // 1,5 godziny, 2 godz., 1 h
  for (const m of text.matchAll(/(\d+(?:[.,]\d+)?)(?:\s*(?:-|–|—|do)\s*\d+(?:[.,]\d+)?)?\s*(godz(?:in[a-zęy]*|\.)?|h)(?![\p{L}])/giu)) {
    add(m.index ?? 0, m[0], num(m[1]) * 3600)
  }
  // 30 sekund
  for (const m of text.matchAll(/(\d+)(?:\s*(?:-|–|—|do)\s*\d+)?\s*(sek(?:und[a-zęy]*|\.)?)(?![\p{L}])/giu)) {
    add(m.index ?? 0, m[0], num(m[1]))
  }
  // pół godziny, godzinę (bez liczby)
  for (const m of text.matchAll(/\bpół\s+godziny\b/giu)) add(m.index ?? 0, m[0], 1800)
  for (const m of text.matchAll(/(?<![\p{L}])(?:przez|około|ok\.)\s+godzin[ęe](?![\p{L}])/giu)) add(m.index ?? 0, m[0], 3600)

  found.sort((a, b) => a.at - b.at)
  const seen = new Set<number>()
  return found.map((f) => f.timer).filter((t) => (seen.has(t.seconds) ? false : (seen.add(t.seconds), true)))
}

/** 125 → „2:05”, 3725 → „1:02:05” */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`
}
