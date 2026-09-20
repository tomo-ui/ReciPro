import { motion } from 'framer-motion'
import type { Recipe, RecipeStats } from '@/types/recipe'
import { formatMinutes, timeAgo, totalTime } from '@/lib/ui'
import { kcalPerServing } from '@/lib/nutrition'
import { useRecipeNutrition } from '@/hooks/useFoodDb'
import { Avatar } from './Avatar'
import { ClockIcon, CommentIcon, FlameIcon, UsersIcon } from './Icons'
import { LikeButton } from './LikeButton'
import { Cover } from './RecipeCard'

interface Props {
  recipe: Recipe
  /** Polubienia i komentarze; puste, dopóki się wczytują */
  stats?: RecipeStats
  onStatsChange: (next: RecipeStats) => void
  onOpen: () => void
  onOpenAuthor: (username: string) => void
}

/** Duża karta do feedu: autor, zdjęcie 4:3, tytuł, czas, porcje i tagi */
export function FeedCard({ recipe, stats, onStatsChange, onOpen, onOpenAuthor }: Props) {
  const author = recipe.author
  const time = formatMinutes(totalTime(recipe))
  const last = stats?.last_comment
  const nutrition = useRecipeNutrition(recipe.ingredients, recipe.servings)
  const kcal = nutrition ? kcalPerServing(nutrition) : null

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="overflow-hidden rounded-[22px] bg-surface shadow-sm"
    >
      {author && (
        <button onClick={() => onOpenAuthor(author.username)} className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left">
          <Avatar name={author.username} src={author.avatar_url} size={34} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] leading-tight font-semibold">{author.username}</span>
            {author.full_name && <span className="block truncate text-[12px] text-label-2">{author.full_name}</span>}
          </span>
          <span className="shrink-0 text-[12px] text-label-2">{timeAgo(recipe.created_at)}</span>
        </button>
      )}

      <motion.button whileTap={{ scale: 0.985 }} onClick={onOpen} className="block w-full text-left">
        <Cover recipe={recipe} className="aspect-[4/3] w-full" />
        <div className="space-y-2 px-3.5 pt-3 pb-2.5">
          <h3 className="text-[18px] leading-snug font-semibold">{recipe.title}</h3>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-label-2">
            {time && (
              <span className="flex items-center gap-1">
                <ClockIcon width={14} height={14} /> {time}
              </span>
            )}
            {recipe.servings && (
              <span className="flex items-center gap-1">
                <UsersIcon width={14} height={14} /> {recipe.servings} porcji
              </span>
            )}
            {kcal !== null && (
              <span className="flex items-center gap-1" title="Szacunek z bazy składników">
                <FlameIcon width={14} height={14} /> ≈ {kcal} kcal{recipe.servings ? ' / porcja' : ''}
              </span>
            )}
          </div>
          {recipe.tags.length > 0 && (
            <p className="flex flex-wrap gap-x-2 text-[13px] text-accent">
              {recipe.tags.slice(0, 4).map((t) => (
                <span key={t}>#{t}</span>
              ))}
            </p>
          )}
        </div>
      </motion.button>

      <div className={`flex items-center gap-5 px-3.5 ${last ? 'pb-2.5' : 'pb-3.5'}`}>
        <LikeButton recipeId={recipe.id} stats={stats} onChange={onStatsChange} />
        <button onClick={onOpen} aria-label="Komentarze" className="flex items-center gap-1.5 text-[14px] text-label-2">
          <CommentIcon width={22} height={22} />
          <span className="tabular-nums">{stats?.comment_count ?? '–'}</span>
        </button>
      </div>
      {last && (
        <button onClick={onOpen} className="block w-full px-3.5 pb-3.5 text-left" aria-label="Zobacz komentarze">
          <span className="flex items-start gap-2.5 rounded-[14px] bg-surface-2 px-3 py-2.5">
            <Avatar name={last.author.username} src={last.author.avatar_url} size={26} />
            <span className="min-w-0 flex-1 text-[14px] leading-snug">
              <span className="line-clamp-2 break-words whitespace-pre-line">
                <span className="font-semibold">{last.author.username}</span> {last.body}
              </span>
              <span className="mt-0.5 block text-[12px] text-label-2">{timeAgo(last.created_at)}</span>
            </span>
          </span>
          {(stats?.comment_count ?? 0) > 1 && (
            <span className="mt-1.5 block px-1 text-[13px] text-label-2">Zobacz wszystkie komentarze ({stats?.comment_count})</span>
          )}
        </button>
      )}
    </motion.article>
  )
}
