import { useId } from 'react'
import { BADGE_TIERS, type VerifiedBadgeTier } from '@/lib/badgeTiers'

interface Props {
  badge?: VerifiedBadgeTier | null
  /** Średnica w px */
  size?: number
  className?: string
  /** Dotknięcie znaczka (np. panel z opisem na profilu). Bez tego znaczek jest tylko ozdobą i nie przechwytuje dotyku. */
  onPress?: () => void
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
 * Z `onPress` jest przyciskiem z powiększonym polem dotyku (znaczek ma ok. 15–19 px, a palec potrzebuje ≥ 44 px).
 */
export function VerifiedBadge({ badge, size = 15, className = '', onPress }: Props) {
  const id = useId()
  if (!badge) return null
  const tier = BADGE_TIERS[badge]
  const icon = (
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
  )
  const box = `ml-1 inline-flex shrink-0 items-center justify-center align-[-0.2em] ${className}`

  if (onPress) {
    return (
      <button
        type="button"
        onClick={onPress}
        aria-label={`Zweryfikowany: ${tier.label}. Pokaż szczegóły`}
        title={tier.label}
        // Niewidoczne powiększenie pola dotyku wokół małej ikony (nie zmienia układu)
        className={`${box} relative cursor-pointer after:absolute after:-inset-3 after:content-[''] active:opacity-60`}
        style={{ width: size, height: size }}
      >
        {icon}
      </button>
    )
  }

  return (
    <span role="img" aria-label={`Zweryfikowany: ${tier.label}`} title={tier.label} className={box} style={{ width: size, height: size }}>
      {icon}
    </span>
  )
}
