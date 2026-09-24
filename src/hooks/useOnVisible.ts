import { useEffect, useRef } from 'react'

/** Ref do elementu, który po pojawieniu się w co najmniej `threshold` na ekranie raz wywołuje `onVisible` */
export function useOnVisible<T extends HTMLElement>(onVisible: () => void, threshold = 0.6) {
  const ref = useRef<T>(null)
  const fired = useRef(false)
  const callback = useRef(onVisible)
  callback.current = onVisible

  useEffect(() => {
    const el = ref.current
    if (!el || fired.current || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !fired.current) {
          fired.current = true
          callback.current()
          observer.disconnect()
        }
      },
      { threshold },
    )
    observer.observe(el)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threshold])

  return ref
}
