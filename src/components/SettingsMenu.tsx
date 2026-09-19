import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { spring } from '@/lib/ui'
import { HeartIcon, PencilIcon } from './Icons'

interface Props {
  unread: number
  onClose: () => void
  onActivity: () => void
  onEditProfile: () => void
  onSignOut?: () => void
}

/** Menu z burgera na profilu: aktywność i ustawienia konta (dolny arkusz, jak w Instagramie) */
export function SettingsMenu({ unread, onClose, onActivity, onEditProfile, onSignOut }: Props) {
  return (
    <>
      <motion.div
        className="fixed inset-0 z-40 bg-black/40"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        onClick={onClose}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Ustawienia i aktywność"
        className="fixed inset-x-0 bottom-0 z-50 rounded-t-[28px] bg-bg px-4 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] shadow-2xl"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={spring}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.04, bottom: 0.7 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 80 || info.velocity.y > 500) onClose()
        }}
      >
        <div className="mx-auto mb-3 h-[5px] w-9 rounded-full bg-label-3" />
        <h2 className="mb-3 text-center text-[17px] font-semibold">Ustawienia i aktywność</h2>

        <ul className="divide-y divide-separator overflow-hidden rounded-[14px] bg-surface">
          <Item icon={<HeartIcon width={22} height={22} />} label="Aktywność" badge={unread} onClick={onActivity} />
          <Item icon={<PencilIcon width={22} height={22} />} label="Edytuj profil" onClick={onEditProfile} />
        </ul>

        {onSignOut && (
          <ul className="mt-3 overflow-hidden rounded-[14px] bg-surface">
            <Item
              label="Wyloguj się"
              danger
              onClick={() => {
                if (confirm('Wylogować się?')) onSignOut()
              }}
            />
          </ul>
        )}
      </motion.div>
    </>
  )
}

function Item({ icon, label, badge, danger, onClick }: { icon?: ReactNode; label: string; badge?: number; danger?: boolean; onClick: () => void }) {
  return (
    <li>
      <motion.button
        whileTap={{ backgroundColor: 'var(--surface-2)' }}
        onClick={onClick}
        className={`flex w-full items-center gap-3 px-4 py-3.5 text-left text-[16px] ${danger ? 'text-red-500' : ''}`}
      >
        {icon}
        <span className="flex-1">{label}</span>
        {!!badge && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[12px] font-bold text-white tabular-nums">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </motion.button>
    </li>
  )
}
