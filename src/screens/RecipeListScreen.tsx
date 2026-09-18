import { useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useScroll, useTransform } from 'framer-motion'
import type { Recipe } from '@/types/recipe'
import { RecipeCard } from '@/components/RecipeCard'
import { PlusIcon, SearchIcon, UserIcon } from '@/components/Icons'

interface Props {
  recipes: Recipe[]
  loading: boolean
  error: string | null
  onRetry: () => void
  onOpen: (id: string) => void
  onAdd: () => void
  /** Obecne tylko przy zalogowanym koncie (Supabase) */
  onSignOut?: () => void
}

export function RecipeListScreen({ recipes, loading, error, onRetry, onOpen, onAdd, onSignOut }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')

  // Efekt iOS: duży tytuł znika, mały pojawia się w pasku wraz z rozmyciem
  const { scrollY } = useScroll({ container: scrollRef })
  const smallTitleOpacity = useTransform(scrollY, [36, 64], [0, 1])
  const barBgOpacity = useTransform(scrollY, [0, 24], [0, 1])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return recipes
    return recipes.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.tags.some((t) => t.toLowerCase().includes(q)) ||
        r.ingredients.some((i) => i.text.toLowerCase().includes(q)),
    )
  }, [recipes, query])

  return (
    <div className="relative h-full">
      {/* Pasek nawigacji */}
      <div className="absolute inset-x-0 top-0 z-20 pt-safe-top">
        <motion.div
          className="glass absolute inset-0 border-b border-separator"
          style={{ opacity: barBgOpacity }}
        />
        <div className="relative flex h-11 items-center justify-between pr-[max(16px,env(safe-area-inset-right))] pl-[max(16px,env(safe-area-inset-left))]">
          {onSignOut ? (
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={() => {
                if (confirm('Wylogować się?')) onSignOut()
              }}
              aria-label="Wyloguj"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-label-2"
            >
              <UserIcon width={18} height={18} />
            </motion.button>
          ) : (
            <div className="w-9" />
          )}
          <motion.h2 style={{ opacity: smallTitleOpacity }} className="text-[17px] font-semibold">
            Przepisy
          </motion.h2>
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={onAdd}
            aria-label="Dodaj przepis"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-white"
          >
            <PlusIcon width={20} height={20} strokeWidth={2.6} />
          </motion.button>
        </div>
      </div>

      <div ref={scrollRef} className="scroll-y h-full">
        <div className="px-[max(16px,env(safe-area-inset-left))] pt-[calc(env(safe-area-inset-top,0px)+44px)] pb-[calc(env(safe-area-inset-bottom,0px)+32px)]">
          <h1 className="pt-1 pb-3 text-[34px] leading-tight font-bold tracking-tight">Przepisy</h1>

          <label className="mb-4 flex items-center gap-2 rounded-[10px] bg-surface-2 px-2.5 py-2 text-label-2">
            <SearchIcon width={17} height={17} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Szukaj przepisu, składnika, tagu"
              className="min-w-0 flex-1 bg-transparent text-label outline-none placeholder:text-label-2"
            />
          </label>

          {error ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-[14px] bg-surface p-4 text-center"
            >
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
                  <RecipeCard key={r.id} recipe={r} onOpen={() => onOpen(r.id)} />
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}

function EmptyState({ hasQuery, onAdd }: { hasQuery: boolean; onAdd: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center gap-2 pt-16 text-center"
    >
      <p className="text-[20px] font-semibold">{hasQuery ? 'Brak wyników' : 'Nie masz jeszcze przepisów'}</p>
      <p className="max-w-[16rem] text-[15px] text-label-2">
        {hasQuery ? 'Spróbuj innej frazy.' : 'Dodaj pierwszy — wklej link albo wpisz ręcznie.'}
      </p>
      {!hasQuery && (
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onAdd}
          className="mt-3 rounded-full bg-accent px-5 py-2.5 text-[15px] font-semibold text-white"
        >
          Dodaj przepis
        </motion.button>
      )}
    </motion.div>
  )
}
