import { useRef, type ReactNode } from 'react'
import { motion, useMotionValue, useScroll, useTransform } from 'framer-motion'
import { TAB_BAR_PADDING } from './TabBar'

interface Props {
  title?: string
  /** Element po tytule (np. znaczek weryfikacji) */
  titleBadge?: ReactNode
  left?: ReactNode
  right?: ReactNode
  /**
   * `large`: duży tytuł, a mały na pasku pojawia się tylko przy przewijaniu w dół;
   * `inline`: bez dużego tytułu — nazwa przy lewej krawędzi paska (jak nazwa użytkownika na profilu w Instagramie);
   * `bare`: bez tytułu, na środku paska własny element (`center`), np. przełącznik feedu.
   */
  variant?: 'large' | 'inline' | 'bare'
  center?: ReactNode
  /** Wariant `large` bez dużego tytułu: mały tytuł na pasku jest widoczny od początku (nie ma czego chować) */
  noLargeTitle?: boolean
  children: ReactNode
}

/** Mały tytuł wjeżdża płynnie na tym odcinku (px), w którym duży tytuł chowa się pod górnym paskiem */
const FADE_DISTANCE = 18
/** Dolny margines dużego tytułu (pb-3) — do położenia samych liter, bez pustego marginesu pod nimi */
const BIG_TITLE_PADDING_BOTTOM = 12

/**
 * Szkielet ekranu zakładki w stylu iOS: górny pasek (rozmyte tło bez obrysu, pojawia się przy przewijaniu)
 * i dolny margines na pływający pasek zakładek. Mały tytuł na pasku pojawia się dopiero wtedy, gdy duży tytuł
 * zniknie pod paskiem — dopóki duży jest widoczny (także na samym początku i przy „gumowym” pociągnięciu w dół),
 * małego nie ma.
 */
export function LargeTitleScreen({ title, titleBadge, left, right, variant = 'large', center, noLargeTitle, children }: Props) {
  const inline = variant === 'inline'
  const bare = variant === 'bare'
  const scrollRef = useRef<HTMLDivElement>(null)
  const { scrollY } = useScroll({ container: scrollRef })
  const barBgOpacity = useTransform(scrollY, [0, 24], [0, 1])

  // Mały tytuł zależy od położenia dużego: przezroczysty, dopóki duży tytuł jest choć trochę pod paskiem widoczny
  const barRef = useRef<HTMLDivElement>(null)
  const bigTitleRef = useRef<HTMLHeadingElement>(null)
  const smallTitleOpacity = useMotionValue(noLargeTitle ? 1 : 0)
  // Liczone synchronicznie w zdarzeniu przewijania, na aktualnym położeniu elementów (bez opóźnienia o klatkę)
  const updateSmallTitle = () => {
    const bar = barRef.current
    const big = bigTitleRef.current
    if (!bar || !big) return // bez dużego tytułu mały jest zawsze widoczny (patrz poniżej)
    const hidden = bar.getBoundingClientRect().bottom - (big.getBoundingClientRect().bottom - BIG_TITLE_PADDING_BOTTOM) // >0: litery dużego tytułu są już pod paskiem
    smallTitleOpacity.set(Math.min(1, Math.max(0, hidden / FADE_DISTANCE)))
  }

  return (
    <div className="relative h-full">
      <div ref={barRef} className="absolute inset-x-0 top-0 z-10 pt-safe-top">
        <motion.div className="glass absolute inset-0" style={{ opacity: barBgOpacity }} />
        <div className="relative flex h-11 items-center justify-between pr-[max(16px,env(safe-area-inset-right))] pl-[max(16px,env(safe-area-inset-left))]">
          {(left || variant === 'large' || bare) && <div className="flex min-w-9 items-center">{left}</div>}
          {bare ? (
            <div className="flex min-w-0 flex-1 items-center justify-center">{center}</div>
          ) : inline ? (
            <h2 className="flex min-w-0 flex-1 items-center text-[20px] font-bold tracking-tight">
              <span className="truncate">{title}</span>
              {titleBadge}
            </h2>
          ) : (
            <motion.h2 style={{ opacity: smallTitleOpacity }} className="text-[17px] font-semibold">
              {title}
            </motion.h2>
          )}
          <div className="flex min-w-9 items-center justify-end">{right}</div>
        </div>
      </div>

      <div ref={scrollRef} onScroll={updateSmallTitle} className="scroll-y h-full">
        <div
          className="px-[max(16px,env(safe-area-inset-left))] pt-[calc(env(safe-area-inset-top,0px)+44px)]"
          style={{ paddingBottom: TAB_BAR_PADDING }}
        >
          {variant === 'large' && !noLargeTitle && <h1 ref={bigTitleRef} className="pt-1 pb-3 text-[34px] leading-tight font-bold tracking-tight">{title}</h1>}
          {children}
        </div>
      </div>
    </div>
  )
}
