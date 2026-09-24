import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Comment, Recipe, RecipeStats } from '@/types/recipe'
import { backend } from '@/lib/data'
import { on } from '@/lib/events'
import { formatMinutes, timeAgo, totalTime } from '@/lib/ui'
import { kcalPerServing } from '@/lib/nutrition'
import { useRecipeNutrition } from '@/hooks/useFoodDb'
import { useOnVisible } from '@/hooks/useOnVisible'
import { Avatar } from './Avatar'
import { VerifiedBadge } from './VerifiedBadge'
import { FollowButton } from './FollowButton'
import { BookmarkIcon, ClockIcon, CommentIcon, FlameIcon, SpinnerIcon, UsersIcon } from './Icons'
import { LikeButton } from './LikeButton'
import { Cover } from './RecipeCard'

/** Tyle komentarzy rozwija się na karcie po „Zobacz więcej komentarzy” */
const EXPANDED_COMMENTS = 5

interface Props {
  recipe: Recipe
  /** Polubienia i komentarze; puste, dopóki się wczytują */
  stats?: RecipeStats
  /** Czy przycisk obserwowania ma być na karcie: tylko dla autorów, których nie obserwowałeś przy ostatnim odświeżeniu feedu */
  showFollow: boolean
  /** Aktualny stan: po dotknięciu przycisk zostaje jako szary „Obserwujesz” do następnego odświeżenia feedu */
  following: boolean
  onFollowChange: (following: boolean) => void
  onStatsChange: (next: RecipeStats) => void
  onOpen: () => void
  onOpenAuthor: (username: string) => void
  /** Otwiera same komentarze; `focus` = od razu z kursorem w polu nowego komentarza */
  onOpenComments: (focus: boolean) => void
  /** Zapisane w mojej książce kucharskiej (zakładka Przepisy) */
  saved: boolean
  onToggleSave: () => Promise<void>
  /** Karta stała się widoczna na ekranie — do liczenia wyświetleń (ranking popularności) */
  onView?: () => void
}

/** Duża karta do feedu: autor (z przyciskiem obserwowania), zdjęcie 4:3, tytuł, czas, porcje, tagi i komentarze */
export function FeedCard({ recipe, stats, showFollow, following, onFollowChange, onStatsChange, onOpen, onOpenAuthor, onOpenComments, saved, onToggleSave, onView }: Props) {
  const [saving, setSaving] = useState(false)
  const visibleRef = useOnVisible<HTMLElement>(() => onView?.())
  const author = recipe.author
  const time = formatMinutes(totalTime(recipe))
  const last = stats?.last_comment
  const count = stats?.comment_count ?? 0
  const nutrition = useRecipeNutrition(recipe.ingredients, recipe.servings)
  const kcal = nutrition ? kcalPerServing(nutrition) : null

  const [descExpanded, setDescExpanded] = useState(false)
  // Bez pomiaru DOM: przy tej szerokości karty i rozmiarze tekstu 2 linijki mieszczą z grubsza tyle znaków
  const DESC_CLAMP_CHARS = 100
  const descNeedsClamp = (recipe.description?.length ?? 0) > DESC_CLAMP_CHARS

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

  // Pozostałe komentarze pod podglądem: najnowszy już jest w podglądzie, więc go pomijamy
  const others = (comments ?? []).filter((c) => c.id !== last?.id)

  function expand() {
    setExpanded(true)
    void loadComments()
  }

  return (
    <motion.article
      ref={visibleRef}
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
          {showFollow && recipe.user_id && <FollowButton userId={recipe.user_id} following={following} onChange={onFollowChange} compact silent />}
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

      {recipe.description && (
        <div className="px-3.5 pb-2.5" data-selectable>
          <p className={`text-[14px] whitespace-pre-line text-label-2 ${descExpanded ? '' : 'line-clamp-2'}`}>{recipe.description}</p>
          {descNeedsClamp && !descExpanded && (
            <button onClick={() => setDescExpanded(true)} className="text-[13px] font-medium text-label-2 active:opacity-60">
              Zobacz więcej
            </button>
          )}
        </div>
      )}

      <div className={`flex items-center gap-5 px-3.5 ${last ? 'pb-2.5' : 'pb-3.5'}`}>
        <LikeButton recipeId={recipe.id} stats={stats} onChange={onStatsChange} />
        {/* Ikona komentarza: od razu pole do napisania komentarza */}
        <button onClick={() => onOpenComments(true)} aria-label="Dodaj komentarz" className="flex items-center gap-1.5 text-[14px] text-label-2">
          <CommentIcon width={22} height={22} />
          <span className="tabular-nums">{stats?.comment_count ?? '–'}</span>
        </button>
        {/* Zapis do mojej książki kucharskiej (tylko zakładka Przepisy, nie mój profil) */}
        <motion.button
          whileTap={{ scale: 0.85 }}
          disabled={saving}
          onClick={async () => {
            setSaving(true)
            try {
              await onToggleSave()
            } finally {
              setSaving(false)
            }
          }}
          aria-label={saved ? 'Zapisano w książce kucharskiej — usuń' : 'Zapisz w książce kucharskiej'}
          aria-pressed={saved}
          className={`ml-auto flex items-center transition-colors disabled:opacity-50 ${saved ? 'text-accent' : 'text-label-2'}`}
        >
          {saving ? <SpinnerIcon width={22} height={22} /> : <BookmarkIcon width={23} height={23} filled={saved} />}
        </motion.button>
      </div>

      {last && (
        <div className="px-3.5 pb-3.5">
          {/* Ostatni komentarz i dolny rząd z linkami zostają na karcie cały czas; rozwinięcie dokłada pozostałe komentarze
              między nimi, każdy wjeżdża płynnie — nic nie znika i nie miga, a wysokość karty rośnie stopniowo */}
          <CommentRow comment={last} lines={2} onOpen={() => onOpenComments(false)} />

          <AnimatePresence initial={false}>
            {expanded &&
              others.map((c) => (
                <motion.div
                  key={c.id}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 38 }}
                  className="overflow-hidden"
                >
                  <div className="pt-2">
                    <CommentRow comment={c} lines={3} onOpen={() => onOpenComments(false)} />
                  </div>
                </motion.div>
              ))}
          </AnimatePresence>

          {count > 1 && (
            <div className="mt-1.5 flex items-center justify-between px-1 text-[13px] text-label-2">
              {!expanded ? (
                <button onClick={expand} className="active:opacity-60">
                  Zobacz więcej komentarzy
                </button>
              ) : count > (comments?.length ?? 0) && comments !== null ? (
                <button onClick={() => onOpenComments(false)} className="active:opacity-60">
                  Zobacz wszystkie komentarze ({count})
                </button>
              ) : (
                <span>{comments === null ? 'Wczytuję…' : ''}</span>
              )}
              {expanded && (
                <button onClick={() => setExpanded(false)} className="active:opacity-60">
                  Zwiń
                </button>
              )}
            </div>
          )}
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
        <span className="min-w-0 flex-1 leading-snug">
          {/* Nazwa, znaczek i czas w jednym rzędzie, wyśrodkowane w pionie (jak w liście komentarzy) */}
          <span className="flex items-center text-[13px] text-label-2">
            <span className="truncate font-semibold text-label">{comment.author.username}</span>
            <VerifiedBadge username={comment.author.username} size={12} className="align-baseline" />
            <span className="ml-1.5 shrink-0">· {timeAgo(comment.created_at)}</span>
          </span>
          <span className={`${lines === 2 ? 'line-clamp-2' : 'line-clamp-3'} block text-[14px] break-words whitespace-pre-line`}>{comment.body}</span>
        </span>
      </span>
    </button>
  )
}
