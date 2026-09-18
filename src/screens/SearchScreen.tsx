import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import type { ProfileSummary, Recipe } from '@/types/recipe'
import type { RecipeSort } from '@/lib/backend'
import { backend } from '@/lib/data'
import { useDebounced } from '@/hooks/useDebounced'
import { usePaged } from '@/hooks/usePaged'
import { Avatar } from '@/components/Avatar'
import { FollowButton } from '@/components/FollowButton'
import { LockIcon, SearchIcon, XIcon } from '@/components/Icons'
import { LargeTitleScreen } from '@/components/LargeTitleScreen'
import { LoadMore } from '@/components/LoadMore'
import { RecipeCard } from '@/components/RecipeCard'
import { SegmentedControl } from '@/components/SegmentedControl'

interface Props {
  onOpenRecipe: (r: Recipe) => void
  onOpenProfile: (username: string) => void
}

type Scope = 'recipes' | 'people'

/**
 * Wyszukiwarka po całej społeczności: przepisy (tytuł, opis, tagi, składniki — bez rozróżniania
 * ogonków i wielkości liter, wszystkie słowa muszą pasować) oraz osoby (nazwa użytkownika lub imię i nazwisko).
 */
export function SearchScreen({ onOpenRecipe, onOpenProfile }: Props) {
  const [text, setText] = useState('')
  const [scope, setScope] = useState<Scope>('recipes')
  const [sort, setSort] = useState<RecipeSort>('relevance')
  const query = useDebounced(text.trim(), 300)
  const [tags, setTags] = useState<{ tag: string; uses: number }[]>([])

  const recipes = usePaged((o, l) => backend.searchRecipes(query, sort, o, l), [query, sort], 12, scope === 'recipes')
  const people = usePaged((o, l) => backend.searchProfiles(query, o, l), [query], 15, scope === 'people')

  useEffect(() => {
    backend.popularTags(16).then(setTags).catch(() => setTags([]))
  }, [])

  const searching = query.length > 0
  const list = scope === 'recipes' ? recipes : people

  return (
    <LargeTitleScreen title="Szukaj">
      <label className="mb-3 flex items-center gap-2 rounded-[10px] bg-surface-2 px-2.5 py-2 text-label-2">
        <SearchIcon width={17} height={17} />
        <input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={scope === 'recipes' ? 'Przepis, składnik lub #tag' : 'Nazwa użytkownika lub imię i nazwisko'}
          autoCapitalize="none"
          autoCorrect="off"
          className="min-w-0 flex-1 bg-transparent text-label outline-none placeholder:text-label-2"
        />
        {text && (
          <button onClick={() => setText('')} aria-label="Wyczyść" className="text-label-2">
            <XIcon width={16} height={16} />
          </button>
        )}
      </label>

      <SegmentedControl<Scope>
        value={scope}
        onChange={setScope}
        options={[
          { value: 'recipes', label: 'Przepisy' },
          { value: 'people', label: 'Osoby' },
        ]}
      />

      {scope === 'recipes' && (
        <>
          {tags.length > 0 && (
            <div className="scroll-y -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
              {tags.map(({ tag }) => (
                <button
                  key={tag}
                  onClick={() => setText(`#${tag}`)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-[14px] ${
                    query.replace('#', '').toLowerCase() === tag ? 'bg-accent text-white' : 'bg-surface text-label'
                  }`}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}
          <div className="mt-3 flex items-center justify-between">
            <p className="text-[13px] font-semibold text-label-2 uppercase">{searching ? 'Wyniki' : 'Najnowsze w społeczności'}</p>
            {searching && (
              <button
                onClick={() => setSort((s) => (s === 'relevance' ? 'newest' : 'relevance'))}
                className="text-[13px] font-semibold text-accent"
              >
                {sort === 'relevance' ? 'Trafność' : 'Najnowsze'}
              </button>
            )}
          </div>
        </>
      )}
      {scope === 'people' && (
        <p className="mt-3 text-[13px] font-semibold text-label-2 uppercase">{searching ? 'Wyniki' : 'Polecane osoby'}</p>
      )}

      <div className="mt-2">
        {list.items.length === 0 && !list.loading && !list.error ? (
          <p className="pt-12 text-center text-[15px] text-label-2">
            {searching ? 'Nic nie znaleziono. Spróbuj innego słowa albo tagu.' : 'Nic tu jeszcze nie ma.'}
          </p>
        ) : scope === 'recipes' ? (
          <div className="grid grid-cols-2 gap-3">
            {recipes.items.map((r) => (
              <RecipeCard key={r.id} recipe={r} showAuthor onOpen={() => onOpenRecipe(r)} />
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-separator overflow-hidden rounded-[14px] bg-surface">
            {people.items.map((p) => (
              <PersonRow
                key={p.id}
                person={p}
                onOpen={() => onOpenProfile(p.username)}
                onFollowChange={(following) =>
                  people.setItems((items) =>
                    items.map((x) =>
                      x.id === p.id
                        ? { ...x, is_following: following, followers_count: x.followers_count + (following ? 1 : -1) }
                        : x,
                    ),
                  )
                }
              />
            ))}
          </ul>
        )}
        <LoadMore loading={list.loading} done={list.done} error={list.error} onLoadMore={list.loadMore} onRetry={list.retry} />
      </div>
    </LargeTitleScreen>
  )
}

function PersonRow({ person, onOpen, onFollowChange }: { person: ProfileSummary; onOpen: () => void; onFollowChange: (f: boolean) => void }) {
  return (
    <li>
      <motion.div whileTap={{ backgroundColor: 'var(--surface-2)' }} onClick={onOpen} className="flex cursor-pointer items-center gap-3 px-4 py-3">
        <Avatar name={person.username} size={46} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 truncate text-[16px] font-semibold">
            {person.username}
            {!person.is_public && <LockIcon width={13} height={13} className="shrink-0 text-label-2" />}
          </p>
          {person.full_name && <p className="truncate text-[14px] text-label-2">{person.full_name}</p>}
          <p className="text-[12px] text-label-2">
            {person.is_public || person.is_me ? `${person.recipe_count} przepisów · ` : ''}
            {person.followers_count} obserwujących
          </p>
        </div>
        {!person.is_me && <FollowButton compact userId={person.id} following={person.is_following} onChange={onFollowChange} />}
      </motion.div>
    </li>
  )
}
