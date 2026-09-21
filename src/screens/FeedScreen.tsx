import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { Recipe } from '@/types/recipe'
import type { FeedMode } from '@/lib/backend'
import { backend } from '@/lib/data'
import { on } from '@/lib/events'
import { spreadAuthors } from '@/lib/feedOrder'
import { usePaged } from '@/hooks/usePaged'
import { useRecipeStats } from '@/hooks/useRecipeStats'
import { FeedCard } from '@/components/FeedCard'
import { HeartIcon } from '@/components/Icons'
import { LargeTitleScreen } from '@/components/LargeTitleScreen'
import { LoadMore } from '@/components/LoadMore'
import { FeedTitle } from '@/components/FeedTitle'

interface Props {
  onOpenRecipe: (r: Recipe) => void
  onOpenProfile: (username: string) => void
  /** Otwiera komentarze pod przepisem; `focus` = z kursorem w polu nowego komentarza */
  onOpenComments: (recipe: Recipe, focus: boolean) => void
  onGoSearch: () => void
  /** Centrum powiadomień i liczba nieprzeczytanych */
  onOpenActivity: () => void
  unread: number
}

const newSeed = () => crypto.randomUUID()

/**
 * „Dla Ciebie”: najpierw przepisy obserwowanych oraz polecane od kont pasujących do Twoich zainteresowań
 * i polubień (też tych, których nie obserwujesz), potem reszta od najnowszych. Kolejność jest stabilna
 * w obrębie jednego odświeżenia (ziarno), więc doładowywanie nie powtarza pozycji.
 * „Najnowsze” pokazuje chronologicznie tylko obserwowanych.
 */
export function FeedScreen({ onOpenRecipe, onOpenProfile, onOpenComments, onGoSearch, onOpenActivity, unread }: Props) {
  const [mode, setMode] = useState<FeedMode>('foryou')
  const [seed, setSeed] = useState(newSeed)
  // Przepisy tego samego autora nie idą jeden po drugim (także na granicy stron; wyświetlone karty się nie przestawiają)
  const lastAuthor = useRef<string | undefined>(undefined)
  const feed = usePaged(
    async (offset, limit) => {
      const rows = await backend.feed(mode, seed, offset, limit)
      const ordered = spreadAuthors(rows, (r) => r.user_id, offset === 0 ? undefined : lastAuthor.current)
      lastAuthor.current = ordered.at(-1)?.user_id ?? (offset === 0 ? undefined : lastAuthor.current)
      return ordered
    },
    [mode, seed],
    8,
  )
  const { stats, set: setStats, refresh: refreshStats } = useRecipeStats(feed.items)

  // Obserwowanie z karty w feedzie: przycisk zmienia się w szary „Obserwujesz” i zostaje do odświeżenia feedu;
  // przycisk w feedzie nie wysyła zdarzenia, więc lista nie przeładowuje się pod palcem
  const [followed, setFollowed] = useState<Record<string, boolean>>({})
  useEffect(() => setFollowed({}), [mode, seed])
  const changeFollow = (userId: string | undefined, next: boolean) => {
    if (userId) setFollowed((f) => ({ ...f, [userId]: next }))
  }

  // Zmiana listy obserwowanych (np. na profilu) lub zainteresowań → nowe ułożenie z aktualnymi danymi
  useEffect(() => on('follows-changed', () => setSeed(newSeed())), [])
  useEffect(() => on('interests-changed', () => setSeed(newSeed())), [])
  // Admin włączył lub wyłączył konta testowe
  useEffect(() => on('visibility-changed', () => setSeed(newSeed())), [])
  // Nowy lub usunięty komentarz: ostatni komentarz na karcie ma być aktualny
  useEffect(() => on('comments-changed', refreshStats), [refreshStats])

  const empty = !feed.loading && !feed.error && feed.items.length === 0

  return (
    <LargeTitleScreen
      variant="bare"
      center={<FeedTitle mode={mode} onChange={setMode} />}
      right={
        <div className="flex items-center gap-2">
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
      {empty ? (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-2 pt-14 text-center">
          <p className="text-[20px] font-semibold">{mode === 'foryou' ? 'Na razie nic tu nie ma' : 'Nie obserwujesz nikogo'}</p>
          <p className="max-w-[18rem] text-[15px] text-label-2">
            {mode === 'foryou'
              ? 'Gdy w aplikacji pojawią się publiczne przepisy, zobaczysz tu te pasujące do Ciebie. Obserwuj osoby i ustaw zainteresowania w ustawieniach profilu.'
              : 'Obserwuj osoby, żeby zobaczyć tu ich przepisy. Znajdziesz je po nazwie użytkownika albo imieniu i nazwisku.'}
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
              showFollow={!r.author?.followed}
              following={followed[r.user_id ?? ''] ?? r.author?.followed ?? false}
              onFollowChange={(next) => changeFollow(r.user_id, next)}
              onStatsChange={(next) => setStats(r.id, next)}
              onOpen={() => onOpenRecipe(r)}
              onOpenAuthor={onOpenProfile}
              onOpenComments={(focus) => onOpenComments(r, focus)}
            />
          ))}
          <LoadMore loading={feed.loading} done={feed.done} error={feed.error} onLoadMore={feed.loadMore} onRetry={feed.retry} />
        </div>
      )}
    </LargeTitleScreen>
  )
}
