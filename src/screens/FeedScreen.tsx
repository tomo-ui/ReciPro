import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import type { Recipe } from '@/types/recipe'
import type { FeedMode } from '@/lib/backend'
import { backend } from '@/lib/data'
import { on } from '@/lib/events'
import { usePaged } from '@/hooks/usePaged'
import { FeedCard } from '@/components/FeedCard'
import { ShuffleIcon } from '@/components/Icons'
import { LargeTitleScreen } from '@/components/LargeTitleScreen'
import { LoadMore } from '@/components/LoadMore'
import { SegmentedControl } from '@/components/SegmentedControl'

interface Props {
  onOpenRecipe: (r: Recipe) => void
  onOpenProfile: (username: string) => void
  onGoSearch: () => void
}

const newSeed = () => crypto.randomUUID()

/**
 * Feed jak na Instagramie: przepisy osób, które obserwujesz. Domyślnie w losowej kolejności
 * (stabilnej w obrębie jednego „tasowania”, więc doładowywanie nie powtarza pozycji),
 * a filtr „Najnowsze” pokazuje je chronologicznie.
 */
export function FeedScreen({ onOpenRecipe, onOpenProfile, onGoSearch }: Props) {
  const [mode, setMode] = useState<FeedMode>('random')
  const [seed, setSeed] = useState(newSeed)
  const feed = usePaged((offset, limit) => backend.feed(mode, seed, offset, limit), [mode, seed], 8)

  // Zmiana listy obserwowanych (na profilu) → nowe losowanie z aktualnymi danymi
  useEffect(() => on('follows-changed', () => setSeed(newSeed())), [])

  const empty = !feed.loading && !feed.error && feed.items.length === 0

  return (
    <LargeTitleScreen
      title="Feed"
      right={
        mode === 'random' ? (
          <motion.button
            whileTap={{ scale: 0.88, rotate: 90 }}
            onClick={() => setSeed(newSeed())}
            aria-label="Wymieszaj ponownie"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-label-2"
          >
            <ShuffleIcon width={18} height={18} />
          </motion.button>
        ) : undefined
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
            <FeedCard key={r.id} recipe={r} onOpen={() => onOpenRecipe(r)} onOpenAuthor={onOpenProfile} />
          ))}
          <LoadMore loading={feed.loading} done={feed.done} error={feed.error} onLoadMore={feed.loadMore} onRetry={feed.retry} />
        </div>
      )}
    </LargeTitleScreen>
  )
}
