import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import type { ProfileSummary, Recipe, RecipeDraft, RecipeStats } from '@/types/recipe'
import type { VerifiedBadgeTier } from '@/lib/badgeTiers'
import { FEATURES } from '@/lib/features'
import { backend } from '@/lib/data'
import { on } from '@/lib/events'
import { usePaged } from '@/hooks/usePaged'
import { useRecipeStats } from '@/hooks/useRecipeStats'
import { Avatar } from '@/components/Avatar'
import { DietTab } from '@/components/DietTab'
import { GoalsTab } from '@/components/GoalsTab'
import { SegmentedControl } from '@/components/SegmentedControl'
import { FollowButton } from '@/components/FollowButton'
import { ClockIcon, CommentIcon, FlameIcon, GridIcon, HeartIcon, LinkIcon, LockIcon, PlusIcon, RowsIcon, SpinnerIcon, UsersIcon } from '@/components/Icons'
import { formatCount, formatMinutes, totalTime } from '@/lib/ui'
import { kcalPerServing } from '@/lib/nutrition'
import { useRecipeNutrition } from '@/hooks/useFoodDb'
import { AvatarLightbox } from '@/components/AvatarLightbox'
import { LoadMore } from '@/components/LoadMore'
import { RecipeCard, Cover } from '@/components/RecipeCard'

interface Props {
  username: string
  onOpenRecipe: (r: Recipe) => void
  /** Tylko na własnym profilu */
  onEdit?: () => void
  /** Tylko na własnym profilu: plus przy zdjęciu profilowym otwiera dodawanie przepisu */
  onAddRecipe?: () => void
  /** Otwiera listę obserwujących / obserwowanych tego profilu */
  onOpenList?: (kind: 'followers' | 'following') => void
  /** Zmiana wartości wymusza ponowne pobranie profilu (np. po edycji) */
  reloadKey?: number
  /** Moje przepisy — do zakładki Cele (tylko własny profil) */
  myRecipes?: Recipe[]
  /** Zapis dopasowanego przepisu jako nowego (zakładka Cele) */
  onSaveRecipe?: (draft: RecipeDraft) => Promise<void>
  /** Otwiera dietę (zakładka Dieta) */
  onOpenDiet?: (id: string) => void
  /** Zmiana wymusza odświeżenie listy diet */
  dietVersion?: number
  /** Wywoływane po wczytaniu profilu — do znaczka weryfikacji w pasku tytułu, który renderuje rodzic */
  onBadgeChange?: (badge: VerifiedBadgeTier | null | undefined) => void
}

type Tab = 'recipes' | 'goals' | 'diet'
type ViewMode = 'grid' | 'feed'
const VIEW_MODE_KEY = 'przepisy:v2:profileViewMode'

/** Profil w stylu Instagrama: awatar, liczniki, przycisk obserwowania i siatka przepisów */
export function ProfileView({ username, onOpenRecipe, onEdit, onAddRecipe, onOpenList, reloadKey, myRecipes, onSaveRecipe, onOpenDiet, dietVersion, onBadgeChange }: Props) {
  const [tab, setTab] = useState<Tab>('recipes')
  const [viewMode, setViewMode] = useState<ViewMode>(() => (localStorage.getItem(VIEW_MODE_KEY) === 'feed' ? 'feed' : 'grid'))
  const [profile, setProfile] = useState<ProfileSummary | null | undefined>(undefined) // undefined = ładowanie
  const [error, setError] = useState<string | null>(null)
  const [zoomed, setZoomed] = useState(false)
  const [shared, setShared] = useState(false)

  function changeViewMode(next: ViewMode) {
    setViewMode(next)
    try {
      localStorage.setItem(VIEW_MODE_KEY, next)
    } catch {
      /* schowek/pamięć niedostępne — tryb po prostu nie przetrwa odświeżenia */
    }
  }

  useEffect(() => {
    let alive = true
    setError(null)
    backend
      .getProfile(username)
      .then((p) => {
        if (!alive) return
        setProfile(p)
        onBadgeChange?.(p?.verified_badge)
      })
      .catch((e: unknown) => {
        if (!alive) return
        setProfile(null)
        setError(e instanceof Error ? e.message : 'Nie udało się wczytać profilu.')
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, reloadKey])

  // Odświeżenie liczników od razu po (od)obserwowaniu kogoś z tego profilu (np. z listy obserwowanych),
  // bez czekania na realtime — ważne zwłaszcza tuż po powrocie do tego ekranu
  useEffect(
    () =>
      on('follows-changed', () => {
        backend
          .getProfile(username)
          .then((fresh) => fresh && setProfile((p) => (p && p.id === fresh.id ? { ...p, followers_count: fresh.followers_count, following_count: fresh.following_count, is_following: fresh.is_following } : p)))
          .catch(() => {})
      }),
    [username],
  )

  const profileId = profile?.id

  // Liczniki na żywo: serwer wysyła zmianę wiersza profilu, gdy ktoś zaczyna lub przestaje obserwować
  useEffect(() => {
    if (!profileId) return
    return backend.subscribeProfileCounts(profileId, (counts) =>
      setProfile((p) => (p && p.id === profileId ? { ...p, ...counts } : p)),
    )
  }, [profileId])

  // Siatka bezpieczeństwa: po powrocie do aplikacji (telefon w tle mógł stracić połączenie) pobieramy liczniki od nowa
  useEffect(() => {
    if (!profileId) return
    const refresh = () => {
      if (document.visibilityState !== 'visible') return
      backend
        .getProfile(username)
        .then((fresh) => fresh && setProfile((p) => (p && p.id === fresh.id ? { ...p, followers_count: fresh.followers_count, following_count: fresh.following_count, is_following: fresh.is_following } : p)))
        .catch(() => {})
    }
    document.addEventListener('visibilitychange', refresh)
    return () => document.removeEventListener('visibilitychange', refresh)
  }, [profileId, username])

  const visible = !!profile && (profile.is_public || profile.is_me)
  const showTabs = FEATURES.diet && !!onOpenDiet
  const recipes = usePaged((o, l) => backend.profileRecipes(profile!, o, l), [profile?.id, reloadKey], 12, visible)
  const { stats: recipeStats, set: setRecipeStat } = useRecipeStats(viewMode === 'feed' ? recipes.items : [])

  if (profile === undefined) {
    return (
      <div className="flex justify-center pt-24 text-label-2">
        <SpinnerIcon width={24} height={24} />
      </div>
    )
  }
  if (profile === null) {
    return (
      <p className="px-6 pt-24 text-center text-[16px] text-label-2">{error ?? `Nie znaleziono użytkownika @${username}.`}</p>
    )
  }

  // Powiększenie: tylko gdy jest zdjęcie; cudze — jeśli właściciel na to pozwala
  const canZoom = !!profile.avatar_url && (profile.is_me || profile.allow_avatar_zoom !== false)

  const setFollowing = (following: boolean) =>
    setProfile((p) =>
      p ? { ...p, is_following: following, followers_count: p.followers_count + (following === p.is_following ? 0 : following ? 1 : -1) } : p,
    )

  async function shareProfile() {
    const text = `Zobacz mój profil w Przepisach: @${profile!.username}`
    if (navigator.share) {
      try {
        await navigator.share({ text })
      } catch {
        /* użytkownik anulował okno udostępniania — nic nie robimy */
      }
      return
    }
    try {
      await navigator.clipboard.writeText(text)
      setShared(true)
      setTimeout(() => setShared(false), 1500)
    } catch {
      /* schowek niedostępny — nic się nie dzieje */
    }
  }

  return (
    <div>
      <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="pt-4 pb-5">
        <div className="flex items-center gap-5">
          <div className="relative shrink-0">
            {canZoom ? (
              <motion.button whileTap={{ scale: 0.96 }} onClick={() => setZoomed(true)} aria-label="Powiększ zdjęcie profilowe" className="block rounded-full">
                <Avatar name={profile.username} src={profile.avatar_url} size={86} />
              </motion.button>
            ) : (
              <Avatar name={profile.username} src={profile.avatar_url} size={86} />
            )}
            {profile.is_me && onAddRecipe && (
              <motion.button
                whileTap={{ scale: 0.88 }}
                onClick={onAddRecipe}
                aria-label="Dodaj przepis"
                className="absolute -right-0.5 -bottom-0.5 flex h-7 w-7 items-center justify-center rounded-full border-[2.5px] border-bg bg-accent text-white shadow-sm"
              >
                <PlusIcon width={15} height={15} strokeWidth={3} />
              </motion.button>
            )}
          </div>
          <div className="min-w-0 flex-1">
            {profile.full_name && <p className="mb-1.5 truncate text-[15px] leading-tight font-semibold">{profile.full_name}</p>}
            <div className="grid grid-cols-3 gap-1">
              <Stat value={visible ? formatCount(profile.recipe_count) : '–'} label="przepisy" />
              <Stat value={formatCount(profile.followers_count)} label="obserwatorzy" onClick={visible && onOpenList ? () => onOpenList('followers') : undefined} />
              <Stat value={formatCount(profile.following_count)} label="obserwowani" onClick={visible && onOpenList ? () => onOpenList('following') : undefined} />
            </div>
          </div>
        </div>

        {profile.bio && <p className="mt-3 text-[14px] leading-snug break-words whitespace-pre-line">{profile.bio}</p>}
        {profile.website && (
          <a
            href={profile.website}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1.5 flex items-center gap-1 text-[14px] font-medium text-accent"
          >
            <LinkIcon width={13} height={13} className="shrink-0" />
            <span className="truncate">{profile.website.replace(/^https?:\/\//, '')}</span>
          </a>
        )}

        <div className="mt-4 flex gap-2">
          {profile.is_me ? (
            <>
              {onEdit && (
                <motion.button whileTap={{ scale: 0.97 }} onClick={onEdit} className="flex-1 rounded-[10px] bg-surface-2 py-2 text-[15px] font-semibold">
                  Edytuj profil
                </motion.button>
              )}
              <motion.button whileTap={{ scale: 0.97 }} onClick={shareProfile} className="flex-1 rounded-[10px] bg-surface-2 py-2 text-[15px] font-semibold">
                {shared ? 'Skopiowano' : 'Udostępnij profil'}
              </motion.button>
            </>
          ) : (
            <div className="flex-1 [&>button]:w-full">
              <FollowButton userId={profile.id} following={profile.is_following} onChange={setFollowing} />
            </div>
          )}
        </div>

        {profile.is_me && !profile.is_public && (
          <p className="mt-3 flex items-start gap-2 rounded-[12px] bg-surface px-3.5 py-2.5 text-[13px] text-label-2">
            <LockIcon width={15} height={15} className="mt-0.5 shrink-0" />
            Profil prywatny: Twoich przepisów nie zobaczą inni użytkownicy, nie pojawią się też w wyszukiwarce ani w ich feedzie.
          </p>
        )}
      </motion.header>

      <AvatarLightbox src={zoomed && canZoom ? profile.avatar_url! : null} name={profile.username} onClose={() => setZoomed(false)} />

      {!visible ? (
        <div className="flex flex-col items-center gap-2 border-t border-separator px-6 pt-10 text-center">
          <LockIcon width={32} height={32} className="text-label-2" />
          <p className="text-[17px] font-semibold">Ten profil jest prywatny</p>
          <p className="text-[14px] text-label-2">Przepisy tej osoby są widoczne tylko dla niej.</p>
        </div>
      ) : (
        <div className="border-t border-separator pt-4">
          <div className="flex items-center justify-between gap-2">
            {showTabs ? (
              <div className="min-w-0 flex-1">
                <SegmentedControl<Tab>
                  value={tab}
                  onChange={setTab}
                  options={[
                    { value: 'recipes', label: 'Przepisy' },
                    ...(profile.is_me ? [{ value: 'goals' as const, label: 'Cele' }] : []),
                    { value: 'diet', label: 'Dieta' },
                  ]}
                />
              </div>
            ) : (
              <p className="text-[15px] font-semibold">Przepisy</p>
            )}
            {tab === 'recipes' && (
              <div className="flex shrink-0 items-center gap-1 rounded-[10px] bg-surface-2 p-0.5">
                <button
                  onClick={() => changeViewMode('grid')}
                  aria-label="Siatka"
                  aria-pressed={viewMode === 'grid'}
                  className={`flex h-8 w-8 items-center justify-center rounded-[8px] ${viewMode === 'grid' ? 'bg-surface text-label' : 'text-label-2'}`}
                >
                  <GridIcon width={17} height={17} />
                </button>
                <button
                  onClick={() => changeViewMode('feed')}
                  aria-label="Lista"
                  aria-pressed={viewMode === 'feed'}
                  className={`flex h-8 w-8 items-center justify-center rounded-[8px] ${viewMode === 'feed' ? 'bg-surface text-label' : 'text-label-2'}`}
                >
                  <RowsIcon width={17} height={17} />
                </button>
              </div>
            )}
          </div>

          {tab === 'goals' && profile.is_me && myRecipes && onSaveRecipe ? (
            <GoalsTab recipes={myRecipes} onSaveRecipe={onSaveRecipe} />
          ) : tab === 'diet' && onOpenDiet ? (
            <DietTab username={profile.username} isMe={profile.is_me} onOpenDiet={onOpenDiet} reloadKey={dietVersion} />
          ) : recipes.items.length === 0 && !recipes.loading && !recipes.error ? (
            <p className="pt-10 text-center text-[15px] text-label-2">
              {profile.is_me ? 'Nie masz jeszcze przepisów.' : 'Ta osoba nie dodała jeszcze przepisów.'}
            </p>
          ) : (
            <div className="pt-3">
              {viewMode === 'grid' ? (
                <div className="grid grid-cols-2 gap-3">
                  {recipes.items.map((r) => (
                    <RecipeCard key={r.id} recipe={r} onOpen={() => onOpenRecipe(r)} />
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {recipes.items.map((r) => (
                    <ProfileFeedCard key={r.id} recipe={r} stats={recipeStats[r.id]} onOpen={() => onOpenRecipe(r)} onStatsChange={(next) => setRecipeStat(r.id, next)} />
                  ))}
                </div>
              )}
              <LoadMore loading={recipes.loading} done={recipes.done} error={recipes.error} onLoadMore={recipes.loadMore} onRetry={recipes.retry} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Stat({ value, label, onClick }: { value: number | string; label: string; onClick?: () => void }) {
  const body = (
    <>
      <motion.p key={String(value)} initial={{ opacity: 0.4, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-[17px] leading-tight font-bold tabular-nums">
        {value}
      </motion.p>
      <p className="text-[12px] whitespace-nowrap">{label}</p>
    </>
  )
  return onClick ? (
    <button onClick={onClick} className="rounded-lg py-0.5 text-left select-none active:bg-surface-2" aria-label={`${label}: ${value}`}>
      {body}
    </button>
  ) : (
    <div className="py-0.5">{body}</div>
  )
}

/** Karta jak w feedzie, ale bez akcji, które tu nie mają sensu (obserwuj, zapisz w książce, komentarze w panelu) —
 * tylko podgląd szczegółów (czas, porcje, kalorie, tagi, opis, liczba polubień i komentarzy) bez wchodzenia w przepis */
function ProfileFeedCard({ recipe, stats, onOpen, onStatsChange }: { recipe: Recipe; stats?: RecipeStats; onOpen: () => void; onStatsChange: (next: RecipeStats) => void }) {
  const time = formatMinutes(totalTime(recipe))
  const nutrition = useRecipeNutrition(recipe.ingredients, recipe.servings)
  const kcal = nutrition ? kcalPerServing(nutrition) : null
  const [descExpanded, setDescExpanded] = useState(false)
  const DESC_CLAMP_CHARS = 100
  const descNeedsClamp = (recipe.description?.length ?? 0) > DESC_CLAMP_CHARS

  async function toggleLike(e: React.MouseEvent) {
    e.stopPropagation()
    if (!stats) return
    const nextLiked = !stats.liked
    onStatsChange({ ...stats, liked: nextLiked, like_count: Math.max(0, stats.like_count + (nextLiked ? 1 : -1)) })
    try {
      await (nextLiked ? backend.likeRecipe(recipe.id) : backend.unlikeRecipe(recipe.id))
    } catch {
      onStatsChange(stats)
    }
  }

  return (
    <article className="overflow-hidden rounded-[22px] bg-surface shadow-sm">
      <button onClick={onOpen} className="block w-full text-left">
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
      </button>

      {recipe.description && (
        <div className="px-3.5 pb-2.5">
          <p className={`text-[14px] whitespace-pre-line text-label-2 ${descExpanded ? '' : 'line-clamp-2'}`}>{recipe.description}</p>
          {descNeedsClamp && !descExpanded && (
            <button onClick={() => setDescExpanded(true)} className="text-[13px] font-medium text-label-2 active:opacity-60">
              Zobacz więcej
            </button>
          )}
        </div>
      )}

      <div className="flex items-center gap-5 px-3.5 pb-3.5 text-[14px] text-label-2">
        <button onClick={toggleLike} disabled={!stats} className={`flex items-center gap-1.5 disabled:opacity-40 ${stats?.liked ? 'text-red-500' : ''}`}>
          <HeartIcon width={20} height={20} filled={stats?.liked} />
          <span className="tabular-nums">{stats?.like_count ?? '–'}</span>
        </button>
        <button onClick={onOpen} className="flex items-center gap-1.5">
          <CommentIcon width={20} height={20} />
          <span className="tabular-nums">{stats?.comment_count ?? '–'}</span>
        </button>
      </div>
    </article>
  )
}
