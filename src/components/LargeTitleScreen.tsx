import { useRef, useState, type ReactNode } from 'react'
import { motion, useMotionValueEvent, useScroll, useTransform } from 'framer-motion'
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
  children: ReactNode
}

/** Po tylu pikselach przewinięcia duży tytuł jest schowany i może pojawić się mały */
const SMALL_TITLE_AFTER = 48
/** Ruch mniejszy niż tyle (px) nie zmienia kierunku, żeby drobne drgania palca nie migały tytułem */
const DIRECTION_SLACK = 2

/**
 * Szkielet ekranu zakładki w stylu iOS: górny pasek (rozmyte tło bez obrysu, pojawia się przy przewijaniu)
 * i dolny margines na pływający pasek zakładek. Mały tytuł na pasku widać tylko wtedy, gdy przewijasz w dół
 * (palec w górę) i jesteś już poniżej dużego tytułu; przy ruchu w górę i na samej górze go nie ma.
 */
export function LargeTitleScreen({ title, titleBadge, left, right, variant = 'large', center, children }: Props) {
  const inline = variant === 'inline'
  const bare = variant === 'bare'
  const scrollRef = useRef<HTMLDivElement>(null)
  const { scrollY } = useScroll({ container: scrollRef })
  const barBgOpacity = useTransform(scrollY, [0, 24], [0, 1])

  const [smallTitleVisible, setSmallTitleVisible] = useState(false)
  const lastY = useRef(0)
  useMotionValueEvent(scrollY, 'change', (y) => {
    const delta = y - lastY.current
    if (y <= SMALL_TITLE_AFTER) setSmallTitleVisible(false)
    else if (delta > DIRECTION_SLACK) setSmallTitleVisible(true)
    else if (delta < -DIRECTION_SLACK) setSmallTitleVisible(false)
    if (Math.abs(delta) > DIRECTION_SLACK || y <= SMALL_TITLE_AFTER) lastY.current = y
  })

  return (
    <div className="relative h-full">
      <div className="absolute inset-x-0 top-0 z-10 pt-safe-top">
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
            <motion.h2
              initial={false}
              animate={{ opacity: smallTitleVisible ? 1 : 0, y: smallTitleVisible ? 0 : -6 }}
              transition={{ duration: 0.2 }}
              aria-hidden={!smallTitleVisible}
              className="text-[17px] font-semibold"
            >
              {title}
            </motion.h2>
          )}
          <div className="flex min-w-9 items-center justify-end">{right}</div>
        </div>
      </div>

      <div ref={scrollRef} className="scroll-y h-full">
        <div
          className="px-[max(16px,env(safe-area-inset-left))] pt-[calc(env(safe-area-inset-top,0px)+44px)]"
          style={{ paddingBottom: TAB_BAR_PADDING }}
        >
          {variant === 'large' && <h1 className="pt-1 pb-3 text-[34px] leading-tight font-bold tracking-tight">{title}</h1>}
          {children}
        </div>
      </div>
    </div>
  )
}
