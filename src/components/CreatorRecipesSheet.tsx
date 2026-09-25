import { useEffect, useState } from 'react'
import type { Recipe } from '@/types/recipe'
import type { TopCreator } from '@/lib/backend'
import { backend } from '@/lib/data'
import { Avatar } from './Avatar'
import { VerifiedBadge } from './VerifiedBadge'
import { RecipeCard } from './RecipeCard'

interface Props {
  creator: TopCreator
  onClose: () => void
  onOpenRecipe: (recipe: Recipe) => void
  onOpenProfile: (username: string) => void
}

/** Najlepsze przepisy jednego z top twórców, w arkuszu wysuwanym po dotknięciu jego kółka na pasku Instastories */
export function CreatorRecipesSheet({ creator, onClose, onOpenRecipe, onOpenProfile }: Props) {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null)

  useEffect(() => {
    let alive = true
    backend
      .topRecipesByUser(creator.user_id, 3)
      .then((r) => alive && setRecipes(r))
      .catch(() => alive && setRecipes([]))
    return () => {
      alive = false
    }
  }, [creator.user_id])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-11 shrink-0 items-center justify-between px-4">
        <span className="w-16" />
        <h2 className="min-w-0 truncate text-center text-[17px] font-semibold">Top twórca</h2>
        <button onClick={onClose} className="w-16 text-right text-[17px] font-semibold text-accent active:opacity-50">
          Gotowe
        </button>
      </header>
      <div className="scroll-y flex-1 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+24px)]">
        <button onClick={() => onOpenProfile(creator.username)} className="flex w-full items-center gap-3 py-3 text-left">
          <Avatar name={creator.username} src={creator.avatar_url} size={52} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center text-[17px] font-semibold">
              <span className="truncate">{creator.username}</span>
              <VerifiedBadge username={creator.username} size={15} />
            </span>
            {creator.full_name && <span className="block truncate text-[13px] text-label-2">{creator.full_name}</span>}
          </span>
        </button>
        <h3 className="mb-2 text-[13px] font-semibold text-label-2">Najlepsze przepisy</h3>
        <div className="grid grid-cols-2 gap-3">
          {recipes === null
            ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="aspect-[4/3] animate-pulse rounded-[20px] bg-surface-2" />)
            : recipes.length === 0
              ? <p className="col-span-2 py-6 text-center text-[14px] text-label-2">Jeszcze bez przepisów</p>
              : recipes.map((r) => <RecipeCard key={r.id} recipe={r} onOpen={() => onOpenRecipe(r)} />)}
        </div>
      </div>
    </div>
  )
}
