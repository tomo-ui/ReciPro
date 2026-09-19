import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { AppNotification } from '@/types/recipe'
import { notificationText } from '@/lib/notificationText'
import { spring } from '@/lib/ui'
import { Avatar } from './Avatar'

interface Props {
  notification: AppNotification | null
  onOpen: () => void
  onDismiss: () => void
}

const VISIBLE_MS = 5000

/** Baner z nowym powiadomieniem na górze ekranu: znika sam, dotknięcie otwiera aktywność */
export function NotificationToast({ notification, onOpen, onDismiss }: Props) {
  useEffect(() => {
    if (!notification) return
    const t = setTimeout(onDismiss, VISIBLE_MS)
    return () => clearTimeout(t)
  }, [notification, onDismiss])

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] px-3 pt-[calc(env(safe-area-inset-top,0px)+8px)]">
      <AnimatePresence>
        {notification && (
          <motion.button
            key={notification.id}
            role="status"
            initial={{ y: -90, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -90, opacity: 0 }}
            transition={spring}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.6, bottom: 0 }}
            onDragEnd={(_, info) => info.offset.y < -20 && onDismiss()}
            onClick={onOpen}
            className="glass pointer-events-auto mx-auto flex w-full max-w-md items-center gap-3 rounded-[22px] border border-separator px-3.5 py-3 text-left shadow-lg"
          >
            <Avatar name={notification.actor.username} src={notification.actor.avatar_url} size={38} />
            <ToastText n={notification} />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}

function ToastText({ n }: { n: AppNotification }) {
  const { action, detail } = notificationText(n)
  return (
    <span className="min-w-0 flex-1 text-[14px] leading-snug">
      <span className="font-semibold">{n.actor.username}</span> {action}
      {detail && <span className="block truncate text-label-2">{detail}</span>}
    </span>
  )
}
