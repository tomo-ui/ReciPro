import { useRef, type ReactNode } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import { TAB_BAR_PADDING } from './TabBar'

interface Props {
  title: string
  left?: ReactNode
  right?: ReactNode
  /** `inline`: bez dużego tytułu — nazwa wyśrodkowana na pasku (jak nazwa użytkownika na profilu w Instagramie) */
  variant?: 'large' | 'inline'
  children: ReactNode
}

/**
 * Szkielet ekranu zakładki w stylu iOS: duży tytuł, który przy przewijaniu zamienia się w mały
 * na rozmytym pasku, oraz dolny margines na pasek zakładek.
 */
export function LargeTitleScreen({ title, left, right, variant = 'large', children }: Props) {
  const inline = variant === 'inline'
  const scrollRef = useRef<HTMLDivElement>(null)
  const { scrollY } = useScroll({ container: scrollRef })
  const smallTitleOpacity = useTransform(scrollY, [36, 64], [0, 1])
  const barBgOpacity = useTransform(scrollY, [0, 24], [0, 1])

  return (
    <div className="relative h-full">
      <div className="absolute inset-x-0 top-0 z-10 pt-safe-top">
        <motion.div className="glass absolute inset-0 border-b border-separator" style={{ opacity: barBgOpacity }} />
        <div className="relative flex h-11 items-center justify-between pr-[max(16px,env(safe-area-inset-right))] pl-[max(16px,env(safe-area-inset-left))]">
          <div className="flex min-w-9 items-center">{left}</div>
          <motion.h2
            style={{ opacity: inline ? 1 : smallTitleOpacity }}
            className={inline ? 'max-w-[70%] truncate text-[20px] font-bold tracking-tight' : 'text-[17px] font-semibold'}
          >
            {title}
          </motion.h2>
          <div className="flex min-w-9 items-center justify-end">{right}</div>
        </div>
      </div>

      <div ref={scrollRef} className="scroll-y h-full">
        <div
          className="px-[max(16px,env(safe-area-inset-left))] pt-[calc(env(safe-area-inset-top,0px)+44px)]"
          style={{ paddingBottom: TAB_BAR_PADDING }}
        >
          {!inline && <h1 className="pt-1 pb-3 text-[34px] leading-tight font-bold tracking-tight">{title}</h1>}
          {children}
        </div>
      </div>
    </div>
  )
}
