import { useLayoutEffect, useRef, useState } from 'react'

interface Props {
  /** 0–1: ile z progu odświeżenia przeciągnięto palcem (patrz LargeTitleScreen) */
  progress: number
  /** Trwa odświeżanie — logo w pełni narysowane, delikatnie pulsuje */
  spinning: boolean
  size?: number
  className?: string
}

interface Lengths {
  bowl: number
  rim: number
  eyeL: number
  eyeR: number
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))
/** Przeskalowuje `progress` z zakresu [start,end] na [0,1], żeby ścieżki rysowały się jedna po drugiej, nie naraz */
const stage = (p: number, start: number, end: number) => clamp01((p - start) / (end - start))

/**
 * Znak aplikacji, który „rysuje się” proporcjonalnie do przeciągnięcia palcem w pull-to-refresh
 * (miska → linia → oczy), a w trakcie odświeżania delikatnie pulsuje. Zamiennik zwykłego spinnera
 * w LargeTitleScreen.tsx — te same ścieżki co AppLogo/LogoMark.
 */
export function RefreshLogo({ progress, spinning, size = 22, className = '' }: Props) {
  const bowlRef = useRef<SVGPathElement>(null)
  const rimRef = useRef<SVGPathElement>(null)
  const eyeLRef = useRef<SVGPathElement>(null)
  const eyeRRef = useRef<SVGPathElement>(null)
  const [lengths, setLengths] = useState<Lengths | null>(null)

  useLayoutEffect(() => {
    if (bowlRef.current && rimRef.current && eyeLRef.current && eyeRRef.current) {
      setLengths({
        bowl: bowlRef.current.getTotalLength(),
        rim: rimRef.current.getTotalLength(),
        eyeL: eyeLRef.current.getTotalLength(),
        eyeR: eyeRRef.current.getTotalLength(),
      })
    }
  }, [])

  const p = clamp01(progress)
  const bowlProgress = spinning ? 1 : stage(p, 0, 0.6)
  const rimProgress = spinning ? 1 : stage(p, 0.3, 0.8)
  const eyeProgress = spinning ? 1 : stage(p, 0.6, 1)

  const dashStyle = (len: number | undefined, drawn: number) =>
    len ? { strokeDasharray: len, strokeDashoffset: len * (1 - drawn) } : { strokeDasharray: 1, strokeDashoffset: 1 }

  return (
    <span aria-hidden className={`inline-block ${spinning ? 'refresh-spin' : ''} ${className}`} style={{ width: (size * 320) / 300, height: size }}>
      <svg width={(size * 320) / 300} height={size} viewBox="96 100 320 340" className="block">
        <g fill="none" stroke="currentColor" strokeWidth="30" strokeLinecap="round" strokeLinejoin="round">
          <path ref={bowlRef} d="M136 232h240v40a104 104 0 0 1-104 104h-32a104 104 0 0 1-104-104z" style={dashStyle(lengths?.bowl, bowlProgress)} />
          <path ref={rimRef} d="M112 232h288" style={dashStyle(lengths?.rim, rimProgress)} />
          <path ref={eyeLRef} d="M216 176c-16-20 16-32 0-52" style={dashStyle(lengths?.eyeL, eyeProgress)} />
          <path ref={eyeRRef} d="M296 176c-16-20 16-32 0-52" style={dashStyle(lengths?.eyeR, eyeProgress)} />
        </g>
      </svg>
    </span>
  )
}
