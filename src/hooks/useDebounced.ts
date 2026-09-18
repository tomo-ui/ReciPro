import { useEffect, useState } from 'react'

/** Wartość z opóźnieniem — żeby nie wołać wyszukiwania przy każdym naciśnięciu klawisza */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
}
