import { useEffect, useState, type Ref } from 'react'
import type { Recipe } from '@/types/recipe'
import type { RecipeSort } from '@/lib/backend'
import { backend } from '@/lib/data'
import { useDebounced } from '@/hooks/useDebounced'
import { usePaged } from '@/hooks/usePaged'
import { SearchIcon, XIcon } from '@/components/Icons'
import { LargeTitleScreen, type LargeTitleScreenHandle } from '@/components/LargeTitleScreen'
import { LoadMore } from '@/components/LoadMore'
import { PersonRow } from '@/components/PersonRow'
import { RecipeCard } from '@/components/RecipeCard'
import { SegmentedControl } from '@/components/SegmentedControl'

interface Props {
  onOpenRecipe: (r: Recipe) => void
  onOpenProfile: (username: string) => void
  /** Dotknięcie zakładki „Szukaj”, gdy już na niej jesteśmy, przewija ją do góry */
  topRef?: Ref<LargeTitleScreenHandle>
}

type Scope = 'recipes' | 'people'

/**
 * Wyszukiwarka po całej społeczności: przepisy (tytuł, opis, tagi, składniki — bez rozróżniania
 * ogonków i wielkości liter, wszystkie słowa muszą pasować) oraz osoby (nazwa użytkownika lub imię i nazwisko).
 */
export function SearchScreen({ onOpenRecipe, onOpenProfile, topRef }: Props) {
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
    <LargeTitleScreen ref={topRef} title="Szukaj" noLargeTitle>
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
