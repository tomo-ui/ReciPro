import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react'
import { motion, useMotionValue, useScroll, useTransform } from 'framer-motion'
import { TAB_BAR_PADDING } from './TabBar'
import { SpinnerIcon } from './Icons'

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
  /** Przeciągnięcie w dół na samej górze odświeża zawartość (jak w iOS) */
  onRefresh?: () => Promise<void>
  children: ReactNode
}

/** Imperatywne API ekranu: dotknięcie tej samej zakładki w pasku na dole przewija ją do góry */
export interface LargeTitleScreenHandle {
  scrollToTop: () => void
}

/** Mały tytuł wjeżdża płynnie na tym odcinku (px), w którym duży tytuł chowa się pod górnym paskiem */
const FADE_DISTANCE = 18
/** Dolny margines dużego tytułu (pb-3) — do położenia samych liter, bez pustego marginesu pod nimi */
const BIG_TITLE_PADDING_BOTTOM = 12
/** Ile px trzeba przeciągnąć w dół, żeby puszczenie palca wywołało odświeżenie */
const REFRESH_THRESHOLD = 64
/** Tłumienie przeciągnięcia (jak „gumowy” scroll w iOS) — 1 px palca = tyle px wizualnego przesunięcia */
const PULL_DAMPING = 0.5
const MAX_PULL = 100

/**
 * Szkielet ekranu zakładki w stylu iOS: górny pasek (rozmyte tło bez obrysu, pojawia się przy przewijaniu)
 * i dolny margines na pływający pasek zakładek. Mały tytuł na pasku pojawia się dopiero wtedy, gdy duży tytuł
 * zniknie pod paskiem — dopóki duży jest widoczny (także na samym początku i przy „gumowym” pociągnięciu w dół),
 * małego nie ma.
 */
export const LargeTitleScreen = forwardRef<LargeTitleScreenHandle, Props>(function LargeTitleScreen(
  { title, titleBadge, left, right, variant = 'large', center, noLargeTitle, onRefresh, children },
  ref,
) {
  const inline = variant === 'inline'
  const bare = variant === 'bare'
  const scrollRef = useRef<HTMLDivElement>(null)
  const { scrollY } = useScroll({ container: scrollRef })
  const barBgOpacity = useTransform(scrollY, [0, 24], [0, 1])

  useImperativeHandle(ref, () => ({
    scrollToTop: () => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }),
  }))

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

  /* — pull-to-refresh: tylko gdy jesteśmy na samej górze i ktoś przeciąga w dół palcem —
     Nasłuch przez natywny addEventListener (nie onTouch* z Reacta): React 17+ dopina touchmove
     jako pasywny, więc preventDefault() w nim jest po cichu ignorowany. Bez przechwycenia
     natywnego zdarzenia przeglądarka scrolluje RÓWNOLEGLE z naszym przesunięciem — stąd „szarpanie”
     i brak płynnego cofnięcia, gdy palec wraca w górę. Blokujemy scroll tylko w trakcie realnego
     ciągnięcia w dół na pozycji 0 — cofnięcie palca natychmiast oddaje kontrolę z powrotem scrollowi. */
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [dragging, setDragging] = useState(false)
  const pullRef = useRef(0)
  const refreshingRef = useRef(false)
  const touchStartY = useRef<number | null>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el || !onRefresh) return

    function onTouchStart(e: TouchEvent) {
      if (refreshingRef.current || el!.scrollTop > 0) {
        touchStartY.current = null
        return
      }
      touchStartY.current = e.touches[0].clientY
    }
    function onTouchMove(e: TouchEvent) {
      if (touchStartY.current === null) return
      const dy = e.touches[0].clientY - touchStartY.current
      // Ciągnięcie w dół, wciąż na samej górze: przejmujemy gest i blokujemy natywny scroll pod nim
      if (dy > 0 && el!.scrollTop === 0) {
        e.preventDefault()
        setDragging(true)
        const next = Math.min(MAX_PULL, dy * PULL_DAMPING)
        pullRef.current = next
        setPull(next)
      } else {
        // Palec wrócił w górę (albo coś już przewinęło stronę) — oddajemy scroll przeglądarce od razu
        pullRef.current = 0
        setPull(0)
      }
    }
    async function onTouchEnd() {
      if (touchStartY.current === null) return
      touchStartY.current = null
      setDragging(false)
      if (pullRef.current >= REFRESH_THRESHOLD) {
        refreshingRef.current = true
        setRefreshing(true)
        pullRef.current = REFRESH_THRESHOLD
        setPull(REFRESH_THRESHOLD)
        try {
          await onRefresh!()
        } finally {
          refreshingRef.current = false
          setRefreshing(false)
          pullRef.current = 0
          setPull(0)
        }
      } else {
        pullRef.current = 0
        setPull(0)
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    el.addEventListener('touchcancel', onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [onRefresh])

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
        {onRefresh && (pull > 0 || refreshing) && (
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-[5] flex justify-center pt-[calc(env(safe-area-inset-top,0px)+50px)]"
            style={{ opacity: Math.min(1, pull / REFRESH_THRESHOLD) }}
          >
            <SpinnerIcon width={20} height={20} className="text-label-2" />
          </div>
        )}
        <div
          style={{ transform: pull ? `translateY(${pull}px)` : undefined, transition: dragging ? 'none' : 'transform 0.25s ease-out' }}
          className="px-[max(16px,env(safe-area-inset-left))] pt-[calc(env(safe-area-inset-top,0px)+44px)]"
        >
          <div style={{ paddingBottom: TAB_BAR_PADDING }}>
            {variant === 'large' && !noLargeTitle && <h1 ref={bigTitleRef} className="pt-1 pb-3 text-[34px] leading-tight font-bold tracking-tight">{title}</h1>}
            {children}
          </div>
        </div>
      </div>
    </div>
  )
})
