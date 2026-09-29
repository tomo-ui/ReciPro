import { useId } from 'react'
import { BADGE_TIERS, type VerifiedBadgeTier } from '@/lib/badgeTiers'

interface Props {
  badge?: VerifiedBadgeTier | null
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
 * Znaczek weryfikacji: kolor i etykieta zależą od przyznanego tieru (patrz `badgeTiers.ts`).
 * Bez znaczka (`badge` puste) nie renderuje nic. Znaczek jest wyśrodkowany względem linii tekstu
 * i ma stały odstęp od nazwy (margines po lewej), więc w rzędach flex wystarczy `gap-0`.
 */
export function VerifiedBadge({ badge, size = 15, className = '' }: Props) {
  const id = useId()
  if (!badge) return null
  const tier = BADGE_TIERS[badge]
  return (
    <span
      role="img"
      aria-label={`Zweryfikowany: ${tier.label}`}
      title={tier.label}
      className={`ml-1 inline-flex shrink-0 items-center justify-center align-[-0.2em] ${className}`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={tier.color} stopOpacity="0.85" />
            <stop offset="1" stopColor={tier.color} />
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
