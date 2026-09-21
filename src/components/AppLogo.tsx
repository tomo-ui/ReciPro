interface Props {
  /** Bok w px */
  size?: number
  /** Odtwarza animację buzi: uśmiech, mrugnięcie i powrót do pierwotnego znaku (zmiana `key` odtwarza od nowa) */
  play?: boolean
  className?: string
}

/**
 * Znak aplikacji: miska to uśmiech, dwie kreski nad nią to oczy. Ta sama grafika i zaokrąglenie co ikona
 * na ekranie głównym (`public/logo.svg`); animacja (index.css, `.logo-play`) kończy się w stanie spoczynku.
 */
export function AppLogo({ size = 80, play = false, className = '' }: Props) {
  return (
    <span
      aria-hidden
      className={`logo-face block overflow-hidden rounded-[22.37%] shadow-lg ${play ? 'logo-play' : ''} ${className}`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox="0 0 512 512" className="block">
        <rect width="512" height="512" fill="#ff6b35" />
        <g fill="none" stroke="#fff" strokeWidth="28" strokeLinecap="round" strokeLinejoin="round">
          <g className="logo-smile">
            <path d="M136 232h240v40a104 104 0 0 1-104 104h-32a104 104 0 0 1-104-104z" />
            <path d="M112 232h288" />
          </g>
          <path className="logo-eye logo-eye-l" d="M216 176c-16-20 16-32 0-52" />
          <path className="logo-eye logo-eye-r" d="M296 176c-16-20 16-32 0-52" />
        </g>
      </svg>
    </span>
  )
}

/**
 * Sam znak (miska-uśmiech i oczy) bez pomarańczowego tła, w kolorze tekstu — do paska u góry feedu.
 * Ta sama animacja co w AppLogo (uśmiech, mrugnięcie, powrót).
 */
export function LogoMark({ size = 30, play = false, className = '' }: Props) {
  return (
    <span aria-hidden className={`logo-face inline-block ${play ? 'logo-play' : ''} ${className}`} style={{ width: (size * 320) / 300, height: size }}>
      <svg width={(size * 320) / 300} height={size} viewBox="96 100 320 300" className="block">
        <g fill="none" stroke="currentColor" strokeWidth="30" strokeLinecap="round" strokeLinejoin="round">
          <g className="logo-smile">
            <path d="M136 232h240v40a104 104 0 0 1-104 104h-32a104 104 0 0 1-104-104z" />
            <path d="M112 232h288" />
          </g>
          <path className="logo-eye logo-eye-l" d="M216 176c-16-20 16-32 0-52" />
          <path className="logo-eye logo-eye-r" d="M296 176c-16-20 16-32 0-52" />
        </g>
      </svg>
    </span>
  )
}
