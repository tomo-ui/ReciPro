import { motion } from 'framer-motion'
import type { MyActivityItem } from '@/types/recipe'
import { backend } from '@/lib/data'
import { coverGradient, timeAgo } from '@/lib/ui'
import { usePaged } from '@/hooks/usePaged'
import { ClockIcon } from '@/components/Icons'
import { LoadMore } from '@/components/LoadMore'

interface Props {
  onClose: () => void
  onOpenRecipe: (recipeId: string) => void
}

/** Moja własna aktywność: co SAM polubiłem i skomentowałem (inne niż serduszko — to tylko powiadomienia o mnie) */
export function MyActivityScreen({ onClose, onOpenRecipe }: Props) {
  const list = usePaged((o, l) => backend.listMyActivity(o, l), [], 20)
  const empty = list.items.length === 0 && !list.loading && !list.error

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-11 shrink-0 items-center justify-between px-4">
        <span className="w-16" />
        <h2 className="text-[17px] font-semibold">Moja aktywność</h2>
        <button onClick={onClose} className="w-16 text-right text-[17px] font-semibold text-accent active:opacity-50">
          Gotowe
        </button>
      </header>
      <div className="scroll-y flex-1 px-[max(16px,env(safe-area-inset-left))] pb-[calc(env(safe-area-inset-bottom,0px)+24px)]">
        {empty ? (
          <div className="flex flex-col items-center gap-2 pt-16 text-center">
            <ClockIcon width={34} height={34} className="text-label-2" />
            <p className="text-[17px] font-semibold">Brak aktywności</p>
            <p className="text-[14px] text-label-2">Tu zobaczysz przepisy, które polubiłeś i skomentowałeś.</p>
          </div>
        ) : (
          <>
            <ul className="mt-3 divide-y divide-separator overflow-hidden rounded-[14px] bg-surface">
              {list.items.map((item, i) => (
                <Row key={`${item.kind}-${item.comment_id ?? item.recipe_id}-${i}`} item={item} onClick={() => onOpenRecipe(item.recipe_id)} />
              ))}
            </ul>
            <LoadMore loading={list.loading} done={list.done} error={list.error} onLoadMore={list.loadMore} onRetry={list.retry} />
          </>
        )}
      </div>
    </div>
  )
}

function Row({ item, onClick }: { item: MyActivityItem; onClick: () => void }) {
  const action = item.kind === 'like' ? 'Polubiono' : 'Skomentowano'
  return (
    <li>
      <motion.button
        whileTap={{ backgroundColor: 'var(--surface-2)' }}
        onClick={onClick}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="min-w-0 flex-1 text-[14px] leading-snug">
          <span>
            {action} <span className="font-semibold">{item.recipe_title}</span>
          </span>
          {item.comment_body && <span className="block truncate text-label-2">{item.comment_body}</span>}
          <span className="block text-[12px] text-label-2">{timeAgo(item.created_at)}</span>
        </span>
        <Thumb title={item.recipe_title} />
      </motion.button>
    </li>
  )
}

function Thumb({ title }: { title: string }) {
  return <span className="h-11 w-11 shrink-0 rounded-[10px]" style={{ background: coverGradient(title) }} />
}
