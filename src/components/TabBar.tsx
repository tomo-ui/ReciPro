import type { ComponentType, SVGProps } from 'react'
import { motion } from 'framer-motion'
import { BookIcon, HomeIcon, SearchIcon, UserIcon } from './Icons'

export type Tab = 'feed' | 'search' | 'mine' | 'profile'

const TABS: { id: Tab; label: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { id: 'feed', label: 'Feed', Icon: HomeIcon },
  { id: 'search', label: 'Szukaj', Icon: SearchIcon },
  { id: 'mine', label: 'Przepisy', Icon: BookIcon },
  { id: 'profile', label: 'Profil', Icon: UserIcon },
]

/** Dolny pasek zakładek w stylu iOS (z uwzględnieniem safe-area) */
export function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav
      className="glass fixed inset-x-0 bottom-0 z-20 border-t border-separator pb-safe-bottom"
      aria-label="Nawigacja"
    >
      <div className="mx-auto flex h-[49px] max-w-xl">
        {TABS.map(({ id, label, Icon }) => {
          const active = id === tab
          return (
            <motion.button
              key={id}
              whileTap={{ scale: 0.9 }}
              onClick={() => onChange(id)}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 ${active ? 'text-accent' : 'text-label-2'}`}
            >
              <Icon width={24} height={24} strokeWidth={active ? 2.4 : 1.8} />
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
