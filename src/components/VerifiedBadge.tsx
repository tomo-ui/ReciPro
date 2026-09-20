import { useId } from 'react'
import { isCreator } from '@/lib/verified'

interface Props {
  username?: string | null
  /** Średnica w px */
  size?: number
  className?: string
}

// Ząbkowana pieczęć: środkowe koło i osiem „płatków” rozmieszczonych co 45°
const LOBES = Array.from({ length: 8 }, (_, i) => {
  const a = (i * Math.PI) / 4
  return { x: 12 + 8.1 * Math.cos(a), y: 12 + 8.1 * Math.sin(a) }
})

/**
 * Niebieski znaczek weryfikacji przy nazwie twórcy aplikacji; dla innych kont nie renderuje nic.
 * Znaczek jest wyśrodkowany względem linii tekstu i ma stały odstęp od nazwy (margines po lewej),
 * więc w rzędach typu flex wystarczy `gap-0`, a w tekście ciągłym zachowuje się jak litera.
 */
export function VerifiedBadge({ username, size = 15, className = '' }: Props) {
  const id = useId()
  if (!isCreator(username)) return null
  return (
    <span
      role="img"
      aria-label="Zweryfikowany: twórca aplikacji"
      title="Twórca aplikacji"
      className={`ml-1 inline-flex shrink-0 items-center justify-center align-[-0.2em] ${className}`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3ba7ff" />
            <stop offset="1" stopColor="#1b83f2" />
          </linearGradient>
        </defs>
        <g fill={`url(#${id})`}>
          <circle cx="12" cy="12" r="8.6" />
          {LOBES.map((l, i) => (
            <circle key={i} cx={l.x} cy={l.y} r="3.9" />
          ))}
        </g>
        <path d="m7.4 12.4 3.3 3.3 6-6.6" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}
