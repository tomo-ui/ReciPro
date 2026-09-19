import type { ComponentType, SVGProps } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BookIcon, HomeIcon, SearchIcon, UserIcon } from './Icons'

export type Tab = 'feed' | 'search' | 'mine' | 'profile'

const TABS: { id: Tab; label: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { id: 'feed', label: 'Feed', Icon: HomeIcon },
  { id: 'search', label: 'Szukaj', Icon: SearchIcon },
  { id: 'mine', label: 'Przepisy', Icon: BookIcon },
  { id: 'profile', label: 'Profil', Icon: UserIcon },
]

/** Dolny pasek zakładek w stylu iOS (z uwzględnieniem safe-area) */
export function TabBar({ tab, onChange, badges = {} }: { tab: Tab; onChange: (t: Tab) => void; badges?: Partial<Record<Tab, number>> }) {
  return (
    <nav
      className="glass fixed inset-x-0 bottom-0 z-20 border-t border-separator pb-safe-bottom"
      aria-label="Nawigacja"
    >
      <div className="mx-auto flex h-[49px] max-w-xl">
        {TABS.map(({ id, label, Icon }) => {
          const active = id === tab
          const badge = badges[id] ?? 0
          return (
            <motion.button
              key={id}
              whileTap={{ scale: 0.9 }}
              onClick={() => onChange(id)}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 ${active ? 'text-accent' : 'text-label-2'}`}
            >
              <span className="relative">
                <Icon width={24} height={24} strokeWidth={active ? 2.4 : 1.8} />
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
              </span>
              <span className="text-[10px] font-medium">{label}</span>
            </motion.button>
          )
        })}
      </div>
    </nav>
  )
}

/** Wysokość paska zakładek + safe-area — dolny margines przewijanej treści */
export const TAB_BAR_PADDING = 'calc(env(safe-area-inset-bottom, 0px) + 49px + 24px)'
