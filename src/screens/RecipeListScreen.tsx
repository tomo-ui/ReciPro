import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Recipe } from '@/types/recipe'
import { fold } from '@/lib/text'
import { isSavedRecipe } from '@/lib/cookbook'
import { LargeTitleScreen } from '@/components/LargeTitleScreen'
import { SegmentedControl } from '@/components/SegmentedControl'
import { RecipeCard } from '@/components/RecipeCard'
import { SearchIcon } from '@/components/Icons'

interface Props {
  recipes: Recipe[]
  loading: boolean
  error: string | null
  onRetry: () => void
  onOpen: (recipe: Recipe) => void
  onAdd: () => void
}

type Scope = 'all' | 'own' | 'saved'

/**
 * Zakładka „Przepisy”: moja książka kucharska (archiwum) — moje przepisy (posty i te tylko dla mnie) oraz zapisane od innych,
 * z oznaczeniem autora oryginału i szybkim filtrem po tytule, tagach i składnikach.
 */
export function RecipeListScreen({ recipes, loading, error, onRetry, onOpen, onAdd }: Props) {
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<Scope>('all')

  const filtered = useMemo(() => {
    const words = fold(query).split(/\s+/).filter(Boolean)
    const inScope = scope === 'all' ? recipes : recipes.filter((r) => isSavedRecipe(r) === (scope === 'saved'))
    if (!words.length) return inScope
    return inScope.filter((r) => {
      const hay = fold([r.title, r.tags.join(' '), ...r.ingredients.map((i) => i.text)].join(' '))
      return words.every((w) => hay.includes(w))
    })
  }, [recipes, query, scope])

  return (
    <LargeTitleScreen
      title="Przepisy"
    >
      <div className="mb-3">
        <SegmentedControl<Scope>
          value={scope}
          onChange={setScope}
          options={[
            { value: 'all', label: 'Wszystkie' },
            { value: 'own', label: 'Moje' },
            { value: 'saved', label: 'Zapisane' },
          ]}
        />
      </div>
      <label className="mb-4 flex items-center gap-2 rounded-[10px] bg-surface-2 px-2.5 py-2 text-label-2">
        <SearchIcon width={17} height={17} />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Szukaj w moich przepisach"
          className="min-w-0 flex-1 bg-transparent text-label outline-none placeholder:text-label-2"
        />
      </label>

      {error ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-[14px] bg-surface p-4 text-center">
          <p className="text-[15px] font-semibold">Nie udało się wczytać przepisów</p>
          <p className="mt-1 text-[13px] text-label-2">{error}</p>
          <button onClick={onRetry} className="mt-3 text-[15px] font-semibold text-accent">
            Spróbuj ponownie
          </button>
        </motion.div>
      ) : !loading && filtered.length === 0 ? (
        <EmptyState hasQuery={query.trim().length > 0} onAdd={onAdd} />
      ) : (
        <motion.div layout className="grid grid-cols-2 gap-3">
          <AnimatePresence mode="popLayout">
            {filtered.map((r) => (
              <RecipeCard key={r.id} recipe={r} onOpen={() => onOpen(r)} />
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </LargeTitleScreen>
  )
}

function EmptyState({ hasQuery, onAdd }: { hasQuery: boolean; onAdd: () => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-2 pt-16 text-center">
      <p className="text-[20px] font-semibold">{hasQuery ? 'Brak wyników' : 'Nie masz jeszcze przepisów'}</p>
      <p className="max-w-[16rem] text-[15px] text-label-2">
        {hasQuery ? 'Spróbuj innej frazy.' : 'Dodaj pierwszy — wklej link albo wpisz ręcznie.'}
      </p>
      {!hasQuery && (
        <motion.button whileTap={{ scale: 0.95 }} onClick={onAdd} className="mt-3 rounded-full bg-accent px-5 py-2.5 text-[15px] font-semibold text-white">
          Dodaj przepis
        </motion.button>
      )}
    </motion.div>
  )
}
