import { useState } from 'react'
import { coverGradient } from '@/lib/ui'

interface Props {
  name: string
  /** Zdjęcie profilowe; bez niego (lub gdy się nie wczyta) pokazujemy inicjał na kolorowym tle */
  src?: string
  size?: number
}

export function Avatar({ name, src, size = 36 }: Props) {
  // Zapamiętujemy, KTÓRY adres się nie wczytał — po zmianie zdjęcia nowy adres dostaje drugą szansę
  const [brokenSrc, setBrokenSrc] = useState<string | undefined>()
  const initial = name.replace(/^[^a-z0-9]+/i, '').charAt(0).toUpperCase() || '?'

  return (
    <span
      aria-hidden
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.42, background: coverGradient(name) }}
    >
      {initial}
      {src && src !== brokenSrc && (
        <img
          src={src}
          alt=""
          draggable={false}
          loading="lazy"
          onError={() => setBrokenSrc(src)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </span>
  )
}
