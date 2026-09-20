import { isCreator } from '@/lib/verified'

interface Props {
  username?: string | null
  /** Średnica w px */
  size?: number
  className?: string
}

/** Złoty znaczek weryfikacji przy nazwie twórcy aplikacji; dla innych kont nie renderuje nic */
export function VerifiedBadge({ username, size = 15, className = '' }: Props) {
  if (!isCreator(username)) return null
  return (
    <span
      role="img"
      aria-label="Zweryfikowany: twórca aplikacji"
      title="Twórca aplikacji"
      className={`inline-flex shrink-0 items-center justify-center rounded-full align-[-2px] shadow-sm ${className}`}
      style={{ width: size, height: size, background: 'linear-gradient(135deg, #ffd95a 0%, #f5b800 55%, #d99a00 100%)' }}
    >
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="m5 12.5 4.5 4.5L19 7.5" />
      </svg>
    </span>
  )
}
