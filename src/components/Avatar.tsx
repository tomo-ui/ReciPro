import { coverGradient } from '@/lib/ui'

/** Awatar z inicjałem i kolorem zależnym od nazwy (bez zdjęć profilowych) */
export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.42, background: coverGradient(name) }}
    >
      {name.replace(/^[^a-z0-9]+/i, '').charAt(0).toUpperCase() || '?'}
    </span>
  )
}
