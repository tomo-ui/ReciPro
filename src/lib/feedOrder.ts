/**
 * Rozprasza przepisy tego samego autora: żaden nie ląduje bezpośrednio po innym przepisie tego autora,
 * o ile da się tego uniknąć. Zachowuje kolejność wejściową na tyle, na ile to możliwe (zachłannie: na każdą
 * pozycję bierze pierwszy przepis innego autora niż poprzedni). `previous` to autor ostatniej już wyświetlonej
 * karty, więc granica stron też jest pilnowana, a wyświetlone wcześniej karty nigdy się nie przestawiają.
 */
export function spreadAuthors<T>(items: readonly T[], authorOf: (item: T) => string | undefined, previous?: string): T[] {
  const pending = [...items]
  const out: T[] = []
  let last = previous
  while (pending.length) {
    const i = pending.findIndex((x) => {
      const a = authorOf(x)
      return a === undefined || a !== last
    })
    const [next] = pending.splice(i === -1 ? 0 : i, 1) // ten sam autor do końca: nie ma wyjścia, zostaje kolejność wejściowa
    out.push(next)
    last = authorOf(next)
  }
  return out
}
