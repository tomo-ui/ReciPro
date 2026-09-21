/** Położenie jednego pola paska zakładek (px od lewej krawędzi paska) */
export interface SlotMetric {
  left: number
  width: number
}

/**
 * Które pole jest pod palcem (`x` liczone od lewej krawędzi paska). Palec poza paskiem po lewej lub prawej
 * wybiera skrajne pole, więc przeciąganie nie „gubi” zakładki, gdy palec zjedzie za krawędź.
 */
export function slotIndexAt(x: number, metrics: readonly SlotMetric[]): number {
  if (metrics.length === 0) return -1
  const i = metrics.findIndex((m) => x >= m.left && x < m.left + m.width)
  if (i >= 0) return i
  return x < metrics[0].left ? 0 : metrics.length - 1
}

/** Jak długo trzeba przytrzymać palec na pasku, żeby włączyć przeciąganie z powiększeniem (ms) */
export const HOLD_MS = 240
/** Przesunięcie palca (px) przed upływem czasu przytrzymania oznacza zwykły gest, nie przytrzymanie */
export const HOLD_MOVE_TOLERANCE = 10
