import { backend } from '@/lib/data'
import { usePaged } from '@/hooks/usePaged'
import { LoadMore } from '@/components/LoadMore'
import { PersonRow } from '@/components/PersonRow'

interface Props {
  recipeId: string
  onOpenProfile: (username: string) => void
}

/** Osoby, które polubiły przepis (dotknięcie licznika polubień w LikeButton) */
export function LikersScreen({ recipeId, onOpenProfile }: Props) {
  const people = usePaged((o, l) => backend.listLikers(recipeId, o, l), [recipeId], 30)

  return (
    <div className="px-[max(16px,env(safe-area-inset-left))] pt-4">
      {people.items.length === 0 && !people.loading && !people.error ? (
        <p className="pt-12 text-center text-[15px] text-label-2">Jeszcze nikt nie polubił tego przepisu.</p>
      ) : (
        <ul className="divide-y divide-separator overflow-hidden rounded-[14px] bg-surface">
          {people.items.map((p) => (
            <PersonRow
              key={p.id}
              person={p}
              onOpen={() => onOpenProfile(p.username)}
              onFollowChange={(f) => people.setItems((items) => items.map((x) => (x.id === p.id ? { ...x, is_following: f } : x)))}
            />
          ))}
        </ul>
      )}
      <LoadMore loading={people.loading} done={people.done} error={people.error} onLoadMore={people.loadMore} onRetry={people.retry} />
    </div>
  )
}
