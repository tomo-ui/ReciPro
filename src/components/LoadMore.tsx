import { useEffect, useRef } from 'react'
import { SpinnerIcon } from './Icons'

interface Props {
  loading: boolean
  done: boolean
  error: string | null
  onLoadMore: () => void
  onRetry: () => void
}

/** Znacznik końca listy: doładowuje kolejną porcję, gdy zbliżasz się do dołu (i pokazuje błąd z ponowieniem) */
export function LoadMore({ loading, done, error, onLoadMore, onRetry }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const loadRef = useRef(onLoadMore)
  loadRef.current = onLoadMore

  useEffect(() => {
    const el = ref.current
    if (!el || done || error) return
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && loadRef.current(), {
      rootMargin: '600px',
    })
    io.observe(el)
    return () => io.disconnect()
  }, [done, error, loading])

  return (
    <div ref={ref} className="flex min-h-10 items-center justify-center py-4 text-[14px] text-label-2">
      {error ? (
        <span className="text-center">
          <span className="block text-red-500">{error}</span>
          <button onClick={onRetry} className="mt-1 font-semibold text-accent">
            Spróbuj ponownie
          </button>
        </span>
      ) : loading ? (
        <SpinnerIcon />
      ) : null}
    </div>
  )
}
