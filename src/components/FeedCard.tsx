import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Recipe, RecipeStats } from '@/types/recipe'
import { backend } from '@/lib/data'
import { formatMinutes, timeAgo, totalTime } from '@/lib/ui'
import { kcalPerServing } from '@/lib/nutrition'
import { useRecipeNutrition } from '@/hooks/useFoodDb'
import { useOnVisible } from '@/hooks/useOnVisible'
import { Avatar } from './Avatar'
import { VerifiedBadge } from './VerifiedBadge'
import { FollowButton } from './FollowButton'
import { BookmarkIcon, ClockIcon, CommentIcon, FlameIcon, HeartIcon, MoreIcon, SpinnerIcon, UsersIcon } from './Icons'
import { LikeButton } from './LikeButton'
import { Cover } from './RecipeCard'

/** Okno podwójnego dotknięcia (jak w Instagramie): drugi tap w tym czasie = polub, nie otwieraj przepisu */
const DOUBLE_TAP_MS = 280
/** Jak długo serce zostaje na środku zdjęcia, zanim zniknie */
const HEART_VISIBLE_MS = 700

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
  /** Otwiera panel komentarzy; `focus` = od razu z kursorem w polu nowego komentarza */
  onOpenComments: (focus: boolean) => void
  /** Otwiera listę osób, które polubiły przepis */
  onOpenLikers: () => void
  /** Zapisane w mojej książce kucharskiej (zakładka Przepisy) */
  saved: boolean
  onToggleSave: () => Promise<void>
  /** Karta stała się widoczna na ekranie — do liczenia wyświetleń (ranking popularności) */
  onView?: () => void
  /** Menu „Zgłoś / Zablokuj” (brak przy własnych przepisach) */
  onMore?: () => void
}

/** Duża karta do feedu: autor (z przyciskiem obserwowania), zdjęcie 4:3 (podwójny tap = polub), tytuł, czas, porcje, tagi */
export function FeedCard({ recipe, stats, showFollow, following, onFollowChange, onStatsChange, onOpen, onOpenAuthor, onOpenComments, onOpenLikers, saved, onToggleSave, onView, onMore }: Props) {
  const [saving, setSaving] = useState(false)
  const visibleRef = useOnVisible<HTMLElement>(() => onView?.())
  const author = recipe.author
  const time = formatMinutes(totalTime(recipe))
  const nutrition = useRecipeNutrition(recipe.ingredients, recipe.servings)
  const kcal = nutrition ? kcalPerServing(nutrition) : null

  const [descExpanded, setDescExpanded] = useState(false)
  // Bez pomiaru DOM: przy tej szerokości karty i rozmiarze tekstu 2 linijki mieszczą z grubsza tyle znaków
  const DESC_CLAMP_CHARS = 100
  const descNeedsClamp = (recipe.description?.length ?? 0) > DESC_CLAMP_CHARS

  /* — podwójny tap na zdjęciu: polub + serce na środku, jak w Instagramie; pojedynczy — otwiera przepis — */
  const lastTapAt = useRef(0)
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const heartTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [heartKey, setHeartKey] = useState(0)
  const [heartVisible, setHeartVisible] = useState(false)
  useEffect(
    () => () => {
      if (openTimer.current) clearTimeout(openTimer.current)
      if (heartTimer.current) clearTimeout(heartTimer.current)
    },
    [],
  )

  async function likeFromDoubleTap() {
    setHeartKey((k) => k + 1)
    setHeartVisible(true)
    if (heartTimer.current) clearTimeout(heartTimer.current)
    heartTimer.current = setTimeout(() => setHeartVisible(false), HEART_VISIBLE_MS)

    if (!stats || stats.liked) return // już polubione — samo serce wystarczy, bez drugiego wywołania
    const before = stats
    onStatsChange({ ...before, liked: true, like_count: before.like_count + 1 })
    try {
      await backend.likeRecipe(recipe.id)
    } catch {
      onStatsChange(before) // cichy rollback — to lekki gest, bez przerywania alertem
    }
  }

  function handleCoverTap() {
    const now = Date.now()
    if (now - lastTapAt.current < DOUBLE_TAP_MS) {
      if (openTimer.current) {
        clearTimeout(openTimer.current)
        openTimer.current = null
      }
      lastTapAt.current = 0
      void likeFromDoubleTap()
    } else {
      lastTapAt.current = now
      openTimer.current = setTimeout(() => {
        openTimer.current = null
        onOpen()
      }, DOUBLE_TAP_MS)
    }
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
                <VerifiedBadge badge={author.verified_badge} size={14} />
              </span>
              <span className="block truncate text-[12px] text-label-2">
                {author.full_name ? `${author.full_name} · ` : ''}
                {timeAgo(recipe.created_at)}
              </span>
            </span>
          </button>
          {showFollow && recipe.user_id && <FollowButton userId={recipe.user_id} following={following} onChange={onFollowChange} compact silent />}
          {onMore && (
            <button onClick={onMore} aria-label="Więcej: zgłoś lub zablokuj" className="-mr-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-label-2 active:bg-surface-2">
              <MoreIcon width={20} height={20} />
            </button>
          )}
        </div>
      )}

      <div className="relative">
        <motion.button whileTap={{ scale: 0.985 }} onClick={handleCoverTap} aria-label={recipe.title} className="block w-full text-left">
          <Cover recipe={recipe} className="aspect-[4/3] w-full" />
        </motion.button>
        <AnimatePresence>
          {heartVisible && (
            <motion.div
              key={heartKey}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1.15 }}
              exit={{ opacity: 0, scale: 1.3 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
            >
              <HeartIcon width={96} height={96} filled className="text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.35)]" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <button onClick={onOpen} className="block w-full text-left">
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
      </button>

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

      <div className="flex items-center gap-5 px-3.5 pb-3.5">
        <LikeButton recipeId={recipe.id} stats={stats} onChange={onStatsChange} onOpenLikers={onOpenLikers} />
        {/* Ikona komentarza: otwiera panel bez fokusu na polu (klawiatura się nie wysuwa) */}
        <button onClick={() => onOpenComments(false)} aria-label="Komentarze" className="flex items-center gap-1.5 text-[14px] text-label-2">
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

      {/* Podgląd ostatniego komentarza, jak w Instagramie — całość otwiera panel komentarzy */}
      {!!stats?.comment_count && (
        <div className="space-y-0.5 px-3.5 pb-3.5">
          {stats.comment_count > 1 && (
            <button onClick={() => onOpenComments(false)} className="block text-[13px] text-label-2 active:opacity-60">
              Wyświetl wszystkie {stats.comment_count} {stats.comment_count < 5 ? 'komentarze' : 'komentarzy'}
            </button>
          )}
          {stats.last_comment && (
            <button onClick={() => onOpenComments(false)} className="flex w-full items-start gap-1.5 text-left text-[13px]">
              <span className="shrink-0 font-semibold">{stats.last_comment.author.username}</span>
              <span className="min-w-0 flex-1 truncate text-label-2">{stats.last_comment.body}</span>
            </button>
          )}
        </div>
      )}
    </motion.article>
  )
}
