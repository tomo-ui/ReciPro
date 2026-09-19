import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import type { AppNotification } from '@/types/recipe'
import { backend } from '@/lib/data'
import { notificationText } from '@/lib/notificationText'
import { coverGradient, timeAgo } from '@/lib/ui'
import { usePaged } from '@/hooks/usePaged'
import { Avatar } from '@/components/Avatar'
import { HeartIcon } from '@/components/Icons'
import { LoadMore } from '@/components/LoadMore'

interface Props {
  /** Zmienia się przy każdym nowym powiadomieniu — lista pobiera się wtedy od nowa */
  arrivals: number
  /** Wywoływane po wczytaniu listy: oznacza powiadomienia jako przeczytane */
  onSeen: () => void
  onOpenProfile: (username: string) => void
  onOpenRecipe: (recipeId: string) => void
}

/** Aktywność: polubienia, komentarze i nowi obserwujący; nieprzeczytane są podświetlone */
export function ActivityScreen({ arrivals, onSeen, onOpenProfile, onOpenRecipe }: Props) {
  const list = usePaged((o, l) => backend.listNotifications(o, l), [arrivals], 20)

  // Ekran jest otwarty, więc wszystko, co na nim widać, jest zauważone. Flagi `read` z listy zostają,
  // dzięki czemu nowe pozycje są nadal podświetlone, choć licznik już się wyzerował.
  const seenFor = useRef(-1)
  useEffect(() => {
    if (!list.loading && seenFor.current !== arrivals) {
      seenFor.current = arrivals
      onSeen()
    }
  }, [list.loading, arrivals, onSeen])

  if (list.items.length === 0 && !list.loading && !list.error) {
    return (
      <div className="flex flex-col items-center gap-2 px-8 pt-24 text-center">
        <HeartIcon width={34} height={34} className="text-label-2" />
        <p className="text-[17px] font-semibold">Brak aktywności</p>
        <p className="text-[14px] text-label-2">Tu zobaczysz polubienia, komentarze i nowych obserwujących.</p>
      </div>
    )
  }

  return (
    <div className="px-[max(16px,env(safe-area-inset-left))] pt-4">
      <ul className="divide-y divide-separator overflow-hidden rounded-[14px] bg-surface">
        {list.items.map((n) => (
          <Row
            key={n.id}
            n={n}
            onClick={() => (n.type === 'follow' || !n.recipe ? onOpenProfile(n.actor.username) : onOpenRecipe(n.recipe.id))}
          />
        ))}
      </ul>
      <LoadMore loading={list.loading} done={list.done} error={list.error} onLoadMore={list.loadMore} onRetry={list.retry} />
    </div>
  )
}

function Row({ n, onClick }: { n: AppNotification; onClick: () => void }) {
  const { action, detail } = notificationText(n)
  return (
    <li>
      <motion.button
        whileTap={{ backgroundColor: 'var(--surface-2)' }}
        onClick={onClick}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left ${n.read ? '' : 'bg-accent/10'}`}
      >
        <Avatar name={n.actor.username} src={n.actor.avatar_url} size={44} />
        <span className="min-w-0 flex-1 text-[14px] leading-snug">
          <span className="font-semibold">{n.actor.username}</span> {action}
          {detail && <span className="block truncate text-label-2">{detail}</span>}
          <span className="block text-[12px] text-label-2">{timeAgo(n.created_at)}</span>
        </span>
        {n.recipe && (n.type === 'like' || n.type === 'comment') && <Thumb title={n.recipe.title} src={n.recipe.image_url} />}
        {!n.read && <span aria-label="Nowe" className="h-2 w-2 shrink-0 rounded-full bg-accent" />}
      </motion.button>
    </li>
  )
}

function Thumb({ title, src }: { title: string; src?: string }) {
  return (
    <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-[10px]" style={{ background: coverGradient(title) }}>
      {src && <img src={src} alt="" draggable={false} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />}
    </span>
  )
}
