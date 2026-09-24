import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'

interface PagedState<T> {
  items: T[]
  loading: boolean
  done: boolean
  error: string | null
}

/**
 * Lista ładowana porcjami. Zmiana `deps` (zapytanie, tryb, ziarno) zaczyna od nowa;
 * spóźnione odpowiedzi ze starego zapytania są ignorowane.
 */
export function usePaged<T>(
  fetchPage: (offset: number, limit: number) => Promise<T[]>,
  deps: unknown[],
  pageSize = 12,
  enabled = true,
) {
  const [state, setState] = useState<PagedState<T>>({ items: [], loading: enabled, done: false, error: null })
  const fetchRef = useRef(fetchPage)
  fetchRef.current = fetchPage
  const generation = useRef(0)
  const stateRef = useRef(state)
  stateRef.current = state

  const run = useCallback(
    (reset: boolean) => {
      const g = reset ? ++generation.current : generation.current
      const offset = reset ? 0 : stateRef.current.items.length
      setState((s) => (reset ? { items: [], loading: true, done: false, error: null } : { ...s, loading: true, error: null }))
      // Zwracamy obietnicę, żeby dało się na nią poczekać (np. pull-to-refresh trzyma wskaźnik do zakończenia)
      return fetchRef
        .current(offset, pageSize)
        .then((rows) => {
          if (g !== generation.current) return
          setState((s) => ({ items: reset ? rows : [...s.items, ...rows], loading: false, done: rows.length < pageSize, error: null }))
        })
        .catch((e: unknown) => {
          if (g !== generation.current) return
          setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : 'Nie udało się wczytać danych.' }))
        })
    },
    [pageSize],
  )

  useEffect(() => {
    if (!enabled) {
      generation.current++
      setState({ items: [], loading: false, done: true, error: null })
      return
    }
    run(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, run])

  const loadMore = useCallback(() => {
    const s = stateRef.current
    if (!s.loading && !s.done && !s.error) run(false)
  }, [run])

  const retry = useCallback(() => run(stateRef.current.items.length === 0), [run])
  const setItems: Dispatch<SetStateAction<T[]>> = useCallback(
    (action) => setState((s) => ({ ...s, items: typeof action === 'function' ? (action as (p: T[]) => T[])(s.items) : action })),
    [],
  )

  return { ...state, loadMore, retry, reload: () => run(true), setItems }
}
