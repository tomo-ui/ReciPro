import type { ComponentType, SVGProps } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BookIcon, HomeIcon, PlusIcon, SearchIcon, UserIcon } from './Icons'

export type Tab = 'feed' | 'search' | 'mine' | 'profile'

type IconType = ComponentType<SVGProps<SVGSVGElement>>

/** Układ: Feed, Szukaj, [+ dodaj przepis], Przepisy, Profil — bez podpisów, z nazwami dla czytników ekranu */
const LEFT: { id: Tab; label: string; Icon: IconType }[] = [
  { id: 'feed', label: 'Feed', Icon: HomeIcon },
  { id: 'search', label: 'Szukaj', Icon: SearchIcon },
]
const RIGHT: { id: Tab; label: string; Icon: IconType }[] = [
  { id: 'mine', label: 'Moje przepisy', Icon: BookIcon },
  { id: 'profile', label: 'Profil', Icon: UserIcon },
]

interface Props {
  tab: Tab
  onChange: (t: Tab) => void
  /** Plus na środku: otwiera dodawanie przepisu */
  onAdd: () => void
  badges?: Partial<Record<Tab, number>>
}

/**
 * Dolny pasek w stylu „liquid glass” z iOS 26: pływający prostokąt z mocno zaokrąglonymi rogami, szkło z rozmyciem
 * tła, połyskiem i jasną krawędzią (index.css, `.liquid-glass`), a zaznaczona zakładka to szklana kapsuła,
 * która sprężyście przesuwa się między ikonami.
 */
export function TabBar({ tab, onChange, onAdd, badges = {} }: Props) {
  const item = ({ id, label, Icon }: (typeof LEFT)[number]) => {
    const active = id === tab
    const badge = badges[id] ?? 0
    return (
      <button
        key={id}
        onClick={() => onChange(id)}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        className="relative flex h-full flex-1 items-center justify-center"
      >
        {active && (
          <motion.span
            layoutId="tab-pill"
            transition={{ type: 'spring', stiffness: 420, damping: 34, mass: 0.9 }}
            className="liquid-pill absolute inset-y-[5px] inset-x-[3px] rounded-[22px]"
          />
        )}
        <motion.span whileTap={{ scale: 0.86 }} className={`relative transition-colors ${active ? 'text-label' : 'text-label-2'}`}>
          <Icon width={26} height={26} strokeWidth={active ? 2.3 : 1.9} />
          <AnimatePresence>
            {badge > 0 && (
              <motion.span
                key="badge"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                aria-label={`Nowe powiadomienia: ${badge}`}
                className="absolute -top-1.5 -right-2.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-red-500 px-1 text-[11px] leading-none font-bold text-white tabular-nums"
              >
                {badge > 99 ? '99+' : badge}
              </motion.span>
            )}
          </AnimatePresence>
        </motion.span>
      </button>
    )
  }

  return (
    <nav
      aria-label="Nawigacja"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-20 px-4"
      style={{ paddingBottom: TAB_BAR_BOTTOM }}
    >
      <div className="liquid-glass pointer-events-auto mx-auto flex h-[64px] max-w-md items-stretch rounded-[26px] px-1.5">
        {LEFT.map(item)}
        <button onClick={onAdd} aria-label="Dodaj przepis" className="relative flex h-full flex-1 items-center justify-center">
          <motion.span whileTap={{ scale: 0.8, rotate: 90 }} transition={{ type: 'spring', stiffness: 500, damping: 24 }} className="text-label">
            <PlusIcon width={30} height={30} strokeWidth={2.2} />
          </motion.span>
        </button>
        {RIGHT.map(item)}
      </div>
    </nav>
  )
}

/** Odstęp paska od dołu ekranu: część safe-area (wskaźnik gestu), żeby pasek „pływał” tuż nad nim */
const TAB_BAR_BOTTOM = 'calc(env(safe-area-inset-bottom, 0px) * 0.6 + 8px)'

/** Wysokość pływającego paska + jego odstęp od dołu + zapas — dolny margines przewijanej treści */
export const TAB_BAR_PADDING = 'calc(env(safe-area-inset-bottom, 0px) * 0.6 + 8px + 64px + 24px)'
