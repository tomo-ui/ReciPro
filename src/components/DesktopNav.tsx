import type { ComponentType, SVGProps } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { LEGAL } from '@/lib/legal'
import { AppLogo } from './AppLogo'
import { BookIcon, HeartIcon, HomeIcon, PlusIcon, SearchIcon, SlidersIcon, UserIcon } from './Icons'
import type { Tab } from './TabBar'

interface Props {
  tab: Tab
  /** Czy na wierzchu są ekrany wepchnięte na stos (przepis, profil innej osoby, aktywność) — wtedy żadna zakładka nie jest „bieżąca” */
  covered: boolean
  onChange: (t: Tab) => void
  onAdd: () => void
  onActivity: () => void
  onSettings: () => void
  /** Liczba nieprzeczytanych powiadomień (czerwona liczba przy Aktywności) */
  unread: number
}

const TABS: { id: Tab; label: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { id: 'feed', label: 'Feed', Icon: HomeIcon },
  { id: 'search', label: 'Szukaj', Icon: SearchIcon },
  { id: 'mine', label: 'Moje przepisy', Icon: BookIcon },
  { id: 'profile', label: 'Profil', Icon: UserIcon },
]

const itemClass = (active: boolean) =>
  `relative flex w-full items-center gap-4 rounded-[14px] px-3 py-3 text-left text-[17px] transition-colors hover:bg-surface ${
    active ? 'bg-surface font-bold text-accent shadow-sm' : 'font-medium'
  }`

/**
 * Boczny pasek nawigacji na komputerze (od 1024 px; patrz `.app-frame` w index.css): zastępuje dolny pasek zakładek.
 * Renderowany w portalu, bo karta z zawartością jest blokiem zawierającym dla elementów `fixed`, a pasek ma leżeć obok niej.
 */
export function DesktopNav({ tab, covered, onChange, onAdd, onActivity, onSettings, unread }: Props) {
  return createPortal(
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[260px] flex-col px-4 pt-7 pb-5 lg:flex" aria-label="Menu główne">
      <div className="mb-7 flex items-center gap-3 px-3">
        <AppLogo size={40} />
        <span className="text-[22px] font-bold tracking-tight">ReciPro</span>
      </div>

      <nav className="flex flex-col gap-1" aria-label="Nawigacja główna">
        {TABS.map(({ id, label, Icon }) => {
          const active = tab === id && !covered
          return (
            <button key={id} onClick={() => onChange(id)} aria-current={active ? 'page' : undefined} className={itemClass(active)}>
              <Icon width={24} height={24} strokeWidth={active ? 2.4 : 2} />
              <span className="flex-1">{label}</span>
            </button>
          )
        })}
        <button onClick={onActivity} className={itemClass(false)}>
          <HeartIcon width={24} height={24} />
          <span className="flex-1">Aktywność</span>
          {unread > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[12px] font-bold text-white tabular-nums">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>
      </nav>

      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={onAdd}
        className="mt-5 flex items-center justify-center gap-2 rounded-[14px] bg-accent px-4 py-3.5 text-[16px] font-bold text-white shadow-sm hover:opacity-90"
      >
        <PlusIcon width={20} height={20} strokeWidth={2.6} /> Dodaj przepis
      </motion.button>

      <div className="mt-auto flex flex-col gap-3">
        <button onClick={onSettings} className={itemClass(false)}>
          <SlidersIcon width={24} height={24} />
          <span className="flex-1">Ustawienia</span>
        </button>
        <div className="flex flex-wrap gap-x-4 gap-y-1 px-3 text-[13px] text-label-2">
          <a href={LEGAL.terms} target="_blank" rel="noopener noreferrer" className="hover:underline">
            Regulamin
          </a>
          <a href={LEGAL.privacy} target="_blank" rel="noopener noreferrer" className="hover:underline">
            Prywatność
          </a>
        </div>
      </div>
    </aside>,
    document.body,
  )
}
