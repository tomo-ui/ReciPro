import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import type { Recipe } from '@/types/recipe'
import type { FeedMode } from '@/lib/backend'
import { backend } from '@/lib/data'
import { on } from '@/lib/events'
import { usePaged } from '@/hooks/usePaged'
import { useRecipeStats } from '@/hooks/useRecipeStats'
import { FeedCard } from '@/components/FeedCard'
import { HeartIcon, ShuffleIcon } from '@/components/Icons'
import { LargeTitleScreen } from '@/components/LargeTitleScreen'
import { LoadMore } from '@/components/LoadMore'
import { SegmentedControl } from '@/components/SegmentedControl'

interface Props {
  onOpenRecipe: (r: Recipe) => void
  onOpenProfile: (username: string) => void
  onGoSearch: () => void
  /** Centrum powiadomień i liczba nieprzeczytanych */
  onOpenActivity: () => void
  unread: number
}

const newSeed = () => crypto.randomUUID()

/**
 * Feed jak na Instagramie: przepisy osób, które obserwujesz. Domyślnie w losowej kolejności
 * (stabilnej w obrębie jednego „tasowania”, więc doładowywanie nie powtarza pozycji),
 * a filtr „Najnowsze” pokazuje je chronologicznie.
 */
export function FeedScreen({ onOpenRecipe, onOpenProfile, onGoSearch, onOpenActivity, unread }: Props) {
  const [mode, setMode] = useState<FeedMode>('random')
  const [seed, setSeed] = useState(newSeed)
  const feed = usePaged((offset, limit) => backend.feed(mode, seed, offset, limit), [mode, seed], 8)
  const { stats, set: setStats } = useRecipeStats(feed.items)

  // Zmiana listy obserwowanych (na profilu) → nowe losowanie z aktualnymi danymi
  useEffect(() => on('follows-changed', () => setSeed(newSeed())), [])

  const empty = !feed.loading && !feed.error && feed.items.length === 0

  return (
    <LargeTitleScreen
      title="Feed"
      right={
        <div className="flex items-center gap-2">
          {mode === 'random' && (
            <motion.button
              whileTap={{ scale: 0.88, rotate: 90 }}
              onClick={() => setSeed(newSeed())}
              aria-label="Wymieszaj ponownie"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-label-2"
            >
              <ShuffleIcon width={18} height={18} />
            </motion.button>
          )}
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={onOpenActivity}
            aria-label={unread > 0 ? `Aktywność, nowe: ${unread}` : 'Aktywność'}
            className="relative flex h-9 w-9 items-center justify-center rounded-full"
          >
            <HeartIcon width={26} height={26} strokeWidth={2} />
            {unread > 0 && (
              <span className="absolute top-0 -right-0.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-red-500 px-1 text-[11px] leading-none font-bold text-white tabular-nums">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </motion.button>
        </div>
      }
    >
      <div className="mb-4">
        <SegmentedControl<FeedMode>
          value={mode}
          onChange={setMode}
          options={[
            { value: 'random', label: 'Losowo' },
            { value: 'newest', label: 'Najnowsze' },
          ]}
        />
      </div>

      {empty ? (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-2 pt-14 text-center">
          <p className="text-[20px] font-semibold">Twój feed jest pusty</p>
          <p className="max-w-[18rem] text-[15px] text-label-2">
            Obserwuj osoby, żeby zobaczyć tu ich przepisy. Znajdziesz je po nazwie użytkownika albo imieniu i nazwisku.
          </p>
          <motion.button whileTap={{ scale: 0.95 }} onClick={onGoSearch} className="mt-3 rounded-full bg-accent px-5 py-2.5 text-[15px] font-semibold text-white">
            Znajdź osoby
          </motion.button>
        </motion.div>
      ) : (
        <div className="space-y-4">
          {feed.items.map((r) => (
            <FeedCard
              key={r.id}
              recipe={r}
              stats={stats[r.id]}
              onStatsChange={(next) => setStats(r.id, next)}
              onOpen={() => onOpenRecipe(r)}
              onOpenAuthor={onOpenProfile}
            />
          ))}
          <LoadMore loading={feed.loading} done={feed.done} error={feed.error} onLoadMore={feed.loadMore} onRetry={feed.retry} />
        </div>
      )}
    </LargeTitleScreen>
  )
}
