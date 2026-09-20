import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import type { ProfileSummary, Recipe, RecipeDraft } from '@/types/recipe'
import { FEATURES } from '@/lib/features'
import { backend } from '@/lib/data'
import { usePaged } from '@/hooks/usePaged'
import { Avatar } from '@/components/Avatar'
import { VerifiedBadge } from '@/components/VerifiedBadge'
import { DietTab } from '@/components/DietTab'
import { GoalsTab } from '@/components/GoalsTab'
import { SegmentedControl } from '@/components/SegmentedControl'
import { FollowButton } from '@/components/FollowButton'
import { LockIcon, PlusIcon, SpinnerIcon } from '@/components/Icons'
import { LoadMore } from '@/components/LoadMore'
import { RecipeCard } from '@/components/RecipeCard'

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
}

type Tab = 'recipes' | 'goals' | 'diet'

/** Profil w stylu Instagrama: awatar, liczniki, przycisk obserwowania i siatka przepisów */
export function ProfileView({ username, onOpenRecipe, onEdit, onAddRecipe, onOpenList, reloadKey, myRecipes, onSaveRecipe, onOpenDiet, dietVersion }: Props) {
  const [tab, setTab] = useState<Tab>('recipes')
  const [profile, setProfile] = useState<ProfileSummary | null | undefined>(undefined) // undefined = ładowanie
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setError(null)
    backend
      .getProfile(username)
      .then((p) => alive && setProfile(p))
      .catch((e: unknown) => {
        if (!alive) return
        setProfile(null)
        setError(e instanceof Error ? e.message : 'Nie udało się wczytać profilu.')
      })
    return () => {
      alive = false
    }
  }, [username, reloadKey])

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

  const setFollowing = (following: boolean) =>
    setProfile((p) =>
      p ? { ...p, is_following: following, followers_count: p.followers_count + (following === p.is_following ? 0 : following ? 1 : -1) } : p,
    )

  return (
    <div>
      <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="pt-4 pb-5">
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <Avatar name={profile.username} src={profile.avatar_url} size={84} />
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
          <div className="grid flex-1 grid-cols-3 text-center">
            <Stat value={visible ? profile.recipe_count : '–'} label="przepisów" />
            <Stat value={profile.followers_count} label="obserwujących" onClick={visible && onOpenList ? () => onOpenList('followers') : undefined} />
            <Stat value={profile.following_count} label="obserwuje" onClick={visible && onOpenList ? () => onOpenList('following') : undefined} />
          </div>
        </div>

        <div className="mt-3">
          <p className="flex items-center gap-1.5 text-[17px] font-semibold">
            @{profile.username}
            <VerifiedBadge username={profile.username} />
            {!profile.is_public && <LockIcon width={15} height={15} className="text-label-2" aria-label="Profil prywatny" />}
          </p>
          {profile.full_name && <p className="text-[15px] text-label-2">{profile.full_name}</p>}
        </div>

        <div className="mt-4 flex gap-2">
          {profile.is_me ? (
            <>
              {onEdit && (
                <motion.button whileTap={{ scale: 0.97 }} onClick={onEdit} className="flex-1 rounded-[10px] bg-surface-2 py-2 text-[15px] font-semibold">
                  Edytuj profil
                </motion.button>
              )}
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

      {!visible ? (
        <div className="flex flex-col items-center gap-2 border-t border-separator px-6 pt-10 text-center">
          <LockIcon width={32} height={32} className="text-label-2" />
          <p className="text-[17px] font-semibold">Ten profil jest prywatny</p>
          <p className="text-[14px] text-label-2">Przepisy tej osoby są widoczne tylko dla niej.</p>
        </div>
      ) : (
        <div className="border-t border-separator pt-4">
          {showTabs && (
            <SegmentedControl<Tab>
              value={tab}
              onChange={setTab}
              options={[
                { value: 'recipes', label: 'Przepisy' },
                ...(profile.is_me ? [{ value: 'goals' as const, label: 'Cele' }] : []),
                { value: 'diet', label: 'Dieta' },
              ]}
            />
          )}

          {tab === 'goals' && profile.is_me && myRecipes && onSaveRecipe ? (
            <GoalsTab recipes={myRecipes} onSaveRecipe={onSaveRecipe} />
          ) : tab === 'diet' && onOpenDiet ? (
            <DietTab username={profile.username} isMe={profile.is_me} onOpenDiet={onOpenDiet} reloadKey={dietVersion} />
          ) : recipes.items.length === 0 && !recipes.loading && !recipes.error ? (
            <p className="pt-10 text-center text-[15px] text-label-2">
              {profile.is_me ? 'Nie masz jeszcze przepisów.' : 'Ta osoba nie dodała jeszcze przepisów.'}
            </p>
          ) : (
            <div className="pt-4">
              <div className="grid grid-cols-2 gap-3">
                {recipes.items.map((r) => (
                  <RecipeCard key={r.id} recipe={r} onOpen={() => onOpenRecipe(r)} />
                ))}
              </div>
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
      <motion.p key={String(value)} initial={{ opacity: 0.4, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-[19px] leading-tight font-bold tabular-nums">
        {value}
      </motion.p>
      <p className="text-[12px] text-label-2">{label}</p>
    </>
  )
  return onClick ? (
    <button onClick={onClick} className="rounded-lg py-0.5 active:bg-surface-2" aria-label={`${label}: ${value}`}>
      {body}
    </button>
  ) : (
    <div>{body}</div>
  )
}
