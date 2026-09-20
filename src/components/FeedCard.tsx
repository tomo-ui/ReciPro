import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Comment, Recipe, RecipeStats } from '@/types/recipe'
import { backend } from '@/lib/data'
import { on } from '@/lib/events'
import { formatMinutes, timeAgo, totalTime } from '@/lib/ui'
import { kcalPerServing } from '@/lib/nutrition'
import { useRecipeNutrition } from '@/hooks/useFoodDb'
import { Avatar } from './Avatar'
import { VerifiedBadge } from './VerifiedBadge'
import { FollowButton } from './FollowButton'
import { ClockIcon, CommentIcon, FlameIcon, SpinnerIcon, UsersIcon } from './Icons'
import { LikeButton } from './LikeButton'
import { Cover } from './RecipeCard'

/** Tyle komentarzy rozwija się na karcie po „Zobacz więcej komentarzy” */
const EXPANDED_COMMENTS = 5

interface Props {
  recipe: Recipe
  /** Polubienia i komentarze; puste, dopóki się wczytują */
  stats?: RecipeStats
  /** Czy zalogowany użytkownik obserwuje autora — wtedy przycisk obserwowania jest ukryty */
  following: boolean
  onFollowChange: (following: boolean) => void
  onStatsChange: (next: RecipeStats) => void
  onOpen: () => void
  onOpenAuthor: (username: string) => void
  /** Otwiera same komentarze; `focus` = od razu z kursorem w polu nowego komentarza */
  onOpenComments: (focus: boolean) => void
}

/** Duża karta do feedu: autor (z przyciskiem obserwowania), zdjęcie 4:3, tytuł, czas, porcje, tagi i komentarze */
export function FeedCard({ recipe, stats, following, onFollowChange, onStatsChange, onOpen, onOpenAuthor, onOpenComments }: Props) {
  const author = recipe.author
  const time = formatMinutes(totalTime(recipe))
  const last = stats?.last_comment
  const count = stats?.comment_count ?? 0
  const nutrition = useRecipeNutrition(recipe.ingredients, recipe.servings)
  const kcal = nutrition ? kcalPerServing(nutrition) : null

  const [expanded, setExpanded] = useState(false)
  const [comments, setComments] = useState<Comment[] | null>(null)
  const loadComments = useCallback(
    () =>
      backend
        .listComments(recipe.id, 0, EXPANDED_COMMENTS)
        .then(setComments)
        .catch(() => setComments((c) => c ?? [])),
    [recipe.id],
  )
  // Rozwinięta lista odświeża się po dodaniu lub usunięciu komentarza (np. w arkuszu komentarzy)
  useEffect(() => (expanded ? on('comments-changed', () => void loadComments()) : undefined), [expanded, loadComments])

  function expand() {
    setExpanded(true)
    void loadComments()
  }

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="overflow-hidden rounded-[22px] bg-surface shadow-sm"
    >
      {author && (
        <div className="flex items-center gap-2.5 px-3.5 py-3">
          <button onClick={() => onOpenAuthor(author.username)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
            <Avatar name={author.username} src={author.avatar_url} size={34} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center text-[15px] leading-tight font-semibold">
                <span className="truncate">{author.username}</span>
                <VerifiedBadge username={author.username} size={14} />
              </span>
              <span className="block truncate text-[12px] text-label-2">
                {author.full_name ? `${author.full_name} · ` : ''}
                {timeAgo(recipe.created_at)}
              </span>
            </span>
          </button>
          {!following && recipe.user_id && <FollowButton userId={recipe.user_id} following={false} onChange={onFollowChange} compact />}
        </div>
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
        {/* Ikona komentarza: od razu pole do napisania komentarza */}
        <button onClick={() => onOpenComments(true)} aria-label="Dodaj komentarz" className="flex items-center gap-1.5 text-[14px] text-label-2">
          <CommentIcon width={22} height={22} />
          <span className="tabular-nums">{stats?.comment_count ?? '–'}</span>
        </button>
      </div>

      {last && (
        <div className="px-3.5 pb-3.5">
          <AnimatePresence initial={false} mode="wait">
            {!expanded ? (
              <motion.div key="collapsed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                <CommentRow comment={last} lines={2} onOpen={() => onOpenComments(false)} />
                {count > 1 && (
                  <button onClick={expand} className="mt-1.5 block px-1 text-[13px] text-label-2 active:opacity-60">
                    Zobacz więcej komentarzy
                  </button>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="expanded"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ type: 'spring', stiffness: 380, damping: 38 }}
                className="overflow-hidden"
              >
                {comments === null ? (
                  <div className="flex justify-center py-3 text-label-2">
                    <SpinnerIcon width={18} height={18} />
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {comments.map((c) => (
                      <li key={c.id}>
                        <CommentRow comment={c} lines={3} onOpen={() => onOpenComments(false)} />
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-1.5 flex items-center justify-between px-1 text-[13px] text-label-2">
                  {count > (comments?.length ?? 0) ? (
                    <button onClick={() => onOpenComments(false)} className="active:opacity-60">
                      Zobacz wszystkie komentarze ({count})
                    </button>
                  ) : (
                    <span />
                  )}
                  <button onClick={() => setExpanded(false)} className="active:opacity-60">
                    Zwiń
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.article>
  )
}

/** Jeden komentarz na karcie: dotknięcie otwiera komentarze */
function CommentRow({ comment, lines, onOpen }: { comment: { author: Comment['author']; body: string; created_at: string }; lines: 2 | 3; onOpen: () => void }) {
  return (
    <button onClick={onOpen} aria-label="Zobacz komentarze" className="block w-full text-left">
      <span className="flex items-start gap-2.5 rounded-[14px] bg-surface-2 px-3 py-2.5">
        <Avatar name={comment.author.username} src={comment.author.avatar_url} size={26} />
        <span className="min-w-0 flex-1 text-[14px] leading-snug">
          <span className={`${lines === 2 ? 'line-clamp-2' : 'line-clamp-3'} break-words whitespace-pre-line`}>
            <span className="font-semibold">{comment.author.username}</span>
            <VerifiedBadge username={comment.author.username} size={12} className="mr-1" /> {comment.body}
          </span>
          <span className="mt-0.5 block text-[12px] text-label-2">{timeAgo(comment.created_at)}</span>
        </span>
      </span>
    </button>
  )
}
