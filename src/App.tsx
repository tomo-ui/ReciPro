import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Session } from '@supabase/supabase-js'
import type { Profile, Recipe, RecipeDraft } from '@/types/recipe'
import { backend, usesSupabase } from '@/lib/data'
import { supabase } from '@/lib/supabase'
import { draftForSaving } from '@/lib/cookbook'
import { isCreator } from '@/lib/verified'
import { deleteRecipeImage } from '@/lib/images'
import { markAppReady } from '@/lib/splash'
import { spring } from '@/lib/ui'
import { useMe } from '@/hooks/useMe'
import { useNotifications } from '@/hooks/useNotifications'
import { useRecipes } from '@/hooks/useRecipes'
import { useSession } from '@/hooks/useSession'
import { MenuIcon } from '@/components/Icons'
import { LargeTitleScreen } from '@/components/LargeTitleScreen'
import { NotificationToast } from '@/components/NotificationToast'
import { VerifiedBadge } from '@/components/VerifiedBadge'
import { PushedScreen } from '@/components/PushedScreen'
import { SettingsMenu } from '@/components/SettingsMenu'
import { Splash } from '@/components/Splash'
import { Sheet } from '@/components/Sheet'
import { TabBar, type Tab } from '@/components/TabBar'
import { ActivityScreen } from '@/screens/ActivityScreen'
import { AddRecipeScreen } from '@/screens/AddRecipeScreen'
import { CaloriesScreen } from '@/screens/CaloriesScreen'
import { EditProfileScreen } from '@/screens/EditProfileScreen'
import { InterestsScreen } from '@/screens/InterestsScreen'
import { CommentsSheet } from '@/components/CommentsSheet'
import { EditRecipeScreen } from '@/screens/EditRecipeScreen'
import { FeedScreen } from '@/screens/FeedScreen'
import { LoginScreen } from '@/screens/LoginScreen'
import { DietScreen } from '@/screens/DietScreen'
import { PeopleListScreen, type ListKind } from '@/screens/PeopleListScreen'
import { ProfileSetupScreen } from '@/screens/ProfileSetupScreen'
import { ProfileView } from '@/screens/ProfileView'
import { RecipeDetailScreen } from '@/screens/RecipeDetailScreen'
import { RecipeListScreen } from '@/screens/RecipeListScreen'
import { SearchScreen } from '@/screens/SearchScreen'

export default function App() {
  return (
    <>
      <AppRoutes />
      {/* Logo z ekranu startowego, które wskakuje na miejsce logo na ekranie logowania */}
      <Splash />
    </>
  )
}

function AppRoutes() {
  const session = useSession()

  if (usesSupabase) {
    if (session === undefined) return <div className="fixed inset-0 bg-bg" /> // sprawdzamy zapisaną sesję
    if (!session) return <LoginScreen />
  }

  // key = użytkownik: po zmianie konta cały stan aplikacji startuje od zera
  return <Gate key={session?.user.id ?? "local"} session={session ?? null} />
}

/** Przepuszcza dalej dopiero, gdy użytkownik ma profil (nazwę użytkownika) */
function Gate({ session }: { session: Session | null }) {
  const { status, me, error, reload, setMe } = useMe(session)
  const signOut = usesSupabase ? () => void supabase?.auth.signOut() : undefined
  const loading = status === 'loading'
  useEffect(() => {
    if (!loading) markAppReady()
  }, [loading])

  if (loading) return <div className="fixed inset-0 bg-bg" />

  if (status === 'error') {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-3 bg-bg px-8 text-center">
        <p className="text-[20px] font-semibold">Nie udało się wczytać profilu</p>
        <p className="max-w-sm text-[14px] text-label-2">{error}</p>
        <button onClick={reload} className="rounded-full bg-accent px-5 py-2.5 text-[15px] font-semibold text-white">
          Spróbuj ponownie
        </button>
        {signOut && (
          <button onClick={signOut} className="text-[14px] text-label-2">
            Wyloguj się
          </button>
        )}
      </div>
    )
  }

  if (!me) {
    const meta = session?.user.user_metadata as { username?: string; full_name?: string } | undefined
    return <ProfileSetupScreen prefill={meta} onDone={setMe} onSignOut={signOut} />
  }

  return <Shell me={me} onMeChange={setMe} onSignOut={signOut} />
}

/** Ekran „wepchnięty” na stos nawigacji ponad zakładkami */
type Entry =
  | { kind: 'recipe'; recipe: Recipe }
  | { kind: 'profile'; username: string }
  | { kind: 'people'; username: string; list: ListKind }
  | { kind: 'activity' }
  | { kind: 'diet'; id: string }

type SheetState =
  | { kind: 'add' }
  | { kind: 'menu' }
  | { kind: 'edit'; recipe: Recipe }
  | { kind: 'edit-profile' }
  | { kind: 'interests' }
  | { kind: 'calories' }
  | { kind: 'comments'; recipe: Recipe; focus: boolean }
  | null

function Shell({ me, onMeChange, onSignOut }: { me: Profile; onMeChange: (p: Profile) => void; onSignOut?: () => void }) {
  const mine = useRecipes()
  const notes = useNotifications(me.id)
  const [tab, setTab] = useState<Tab>('feed')
  const [visited, setVisited] = useState<Set<Tab>>(() => new Set<Tab>(['feed']))
  const [stack, setStack] = useState<Entry[]>([])
  const [sheet, setSheet] = useState<SheetState>(null)
  /** Zmiana wymusza ponowne pobranie własnego profilu (liczniki, siatka) po dodaniu/edycji/usunięciu */
  const [profileVersion, setProfileVersion] = useState(0)
  const bump = () => setProfileVersion((v) => v + 1)
  /** Zmiana w dietach odświeża ich listy na profilach */
  const [dietVersion, setDietVersion] = useState(0)
  const bumpDiets = useCallback(() => setDietVersion((v) => v + 1), [])

  function changeTab(next: Tab) {
    setTab(next)
    setVisited((v) => (v.has(next) ? v : new Set(v).add(next)))
    setStack([]) // dotknięcie zakładki wraca do jej początku, jak w iOS
  }

  const openRecipe = (recipe: Recipe) => setStack((s) => [...s, { kind: 'recipe', recipe }])
  const openProfile = (username: string) => {
    if (username === me.username) return changeTab('profile')
    setStack((s) => [...s, { kind: 'profile', username }])
  }
  const openList = (username: string, list: ListKind) => setStack((s) => [...s, { kind: 'people', username, list }])
  const pop = () => setStack((s) => s.slice(0, -1))
  const openActivity = () => {
    setSheet(null)
    notes.dismissLatest()
    setStack((s) => (s.some((e) => e.kind === 'activity') ? s : [...s, { kind: 'activity' }]))
  }
  // Z aktywności otwieramy przepis po id: wpis nie niesie całego przepisu
  const openRecipeById = (id: string) => {
    backend
      .getRecipe(id)
      .then((r) => (r ? openRecipe(r) : alert('Ten przepis został usunięty.')))
      .catch((e: unknown) => alert(e instanceof Error ? e.message : 'Nie udało się otworzyć przepisu.'))
  }
  const openDiet = (id: string) => setStack((s) => [...s, { kind: 'diet', id }])
  /** Dieta widziana na cudzym profilu została zapisana u mnie: w tym miejscu stosu pokazujemy moją kopię */
  const replaceWithOwnDiet = (id: string) => setStack((s) => [...s.slice(0, -1), { kind: 'diet', id }])
  /** Zapis dopasowanego przepisu jako nowego (zakładka Cele) */
  const saveAdaptedRecipe = async (draft: RecipeDraft) => {
    await mine.add(draft)
    bump()
  }
  // Książka kucharska: cudze przepisy zapisane w zakładce Przepisy (nie na profilu), z oznaczeniem autora oryginału
  const savedByOriginal = useMemo(
    () => new Map(mine.recipes.flatMap((r) => (r.saved_from?.recipe_id ? [[r.saved_from.recipe_id, r] as const] : []))),
    [mine.recipes],
  )
  const savedIds = useMemo<ReadonlySet<string>>(() => new Set(savedByOriginal.keys()), [savedByOriginal])
  const toggleSave = async (recipe: Recipe) => {
    const existing = savedByOriginal.get(recipe.id)
    try {
      if (existing) {
        if (!confirm('Usunąć ten przepis ze swojej książki kucharskiej?')) return
        await mine.remove(existing)
      } else {
        const { draft, ownImage } = await draftForSaving(recipe)
        try {
          await mine.add(draft)
        } catch (e) {
          if (ownImage) await deleteRecipeImage(draft.image_url) // nie zostawiamy zdjęcia bez przepisu
          throw e
        }
      }
      bump()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Nie udało się zapisać przepisu.')
    }
  }
  const { markRead } = notes
  const onSeen = useCallback(() => void markRead(), [markRead])

  const top = stack[stack.length - 1]
  const screen = (id: Tab, node: React.ReactNode) =>
    visited.has(id) && (
      // Zmiana zakładki: wchodzący ekran płynnie wyłania się nad wychodzącym (ma własne tło), a wychodzący znika dopiero
      // po zakończeniu przejścia — bez migania i skoków. Przy „ogranicz ruch” zmiana jest natychmiastowa.
      <div
        className={`absolute inset-0 bg-bg ${
          tab === id
            ? 'visible z-10 opacity-100 [transition:opacity_260ms_ease-out] motion-reduce:[transition:none]'
            : 'invisible pointer-events-none z-0 opacity-0 [transition:opacity_0s_linear_260ms,visibility_0s_linear_260ms] motion-reduce:[transition:none]'
        }`}
        aria-hidden={tab !== id}
        inert={tab !== id}
      >
        {node}
      </div>
    )

  return (
    <div className="fixed inset-0 overflow-hidden bg-bg">
      {/* Zakładki zostają zamontowane po pierwszym wejściu, więc wracasz z zachowanym przewinięciem i stanem */}
      <motion.div
        className="relative h-full"
        animate={{ x: top ? '-28%' : 0, opacity: top ? 0.6 : 1 }}
        transition={spring}
      >
        {screen('feed', <FeedScreen
            onOpenRecipe={openRecipe}
            onOpenProfile={openProfile}
            onGoSearch={() => changeTab('search')}
            onOpenActivity={openActivity}
            onOpenComments={(recipe, focus) => setSheet({ kind: 'comments', recipe, focus })}
            savedIds={savedIds}
            onToggleSave={toggleSave}
            unread={notes.unread}
          />)}
        {screen('search', <SearchScreen onOpenRecipe={openRecipe} onOpenProfile={openProfile} />)}
        {screen(
          'mine',
          <RecipeListScreen
            recipes={mine.recipes}
            loading={mine.loading}
            error={mine.error}
            onRetry={mine.reload}
            onOpen={openRecipe}
            onAdd={() => setSheet({ kind: 'add' })}
          />,
        )}
        {screen(
          'profile',
          <LargeTitleScreen
            title={me.username}
            titleBadge={<VerifiedBadge username={me.username} size={19} className="ml-1.5" />}
            variant="inline"
            right={
              <motion.button
                whileTap={{ scale: 0.88 }}
                onClick={() => setSheet({ kind: 'menu' })}
                aria-label="Ustawienia i aktywność"
                className="relative flex h-9 w-9 items-center justify-center rounded-full"
              >
                <MenuIcon width={26} height={26} strokeWidth={2.2} />
                {notes.unread > 0 && <span aria-hidden className="absolute top-1 right-1 h-2.5 w-2.5 rounded-full border-2 border-bg bg-red-500" />}
              </motion.button>
            }
          >
            <ProfileView
              username={me.username}
              reloadKey={profileVersion}
              onOpenRecipe={openRecipe}
              onEdit={() => setSheet({ kind: 'edit-profile' })}
              onOpenList={(kind) => openList(me.username, kind)}
              onAddRecipe={() => setSheet({ kind: 'add' })}
              myRecipes={mine.recipes}
              onSaveRecipe={saveAdaptedRecipe}
              onOpenDiet={openDiet}
              dietVersion={dietVersion}
            />
          </LargeTitleScreen>,
        )}
      </motion.div>

      <TabBar tab={tab} onChange={changeTab} onAdd={() => setSheet({ kind: 'add' })} badges={{ profile: notes.unread }} rainbow={tab === 'profile' && !top} />

      <AnimatePresence>
        {stack.map((entry, i) =>
          entry.kind === 'recipe' ? (
            <RecipeDetailScreen
              key={`recipe-${entry.recipe.id}-${i}`}
              recipe={entry.recipe}
              me={me}
              isOwner={entry.recipe.user_id === me.id}
              onBack={pop}
              onEdit={() => setSheet({ kind: 'edit', recipe: entry.recipe })}
              onDelete={async () => {
                try {
                  await mine.remove(entry.recipe) // usuwa też zdjęcie z bazy
                  bump()
                  pop()
                } catch (e) {
                  alert(e instanceof Error ? e.message : 'Nie udało się usunąć przepisu.')
                }
              }}
              onOpenAuthor={openProfile}
              saved={savedIds.has(entry.recipe.id)}
              onToggleSave={() => toggleSave(entry.recipe)}
              onSaveCopy={async (draft) => {
                await mine.add(draft) // nowy przepis w „Przepisy”; zostajemy na ekranie szczegółów
                bump()
              }}
            />
          ) : entry.kind === 'profile' ? (
            <PushedScreen key={`profile-${entry.username}-${i}`} title={entry.username} titleStart titleBadge={<VerifiedBadge username={entry.username} size={17} className="ml-1.5" />} onBack={pop}>
              <div className="px-[max(16px,env(safe-area-inset-left))]">
                <ProfileView
                  username={entry.username}
                  onOpenRecipe={openRecipe}
                  onOpenList={(kind) => openList(entry.username, kind)}
                  onOpenDiet={openDiet}
                  dietVersion={dietVersion}
                />
              </div>
            </PushedScreen>
          ) : entry.kind === 'diet' ? (
            <PushedScreen key={`diet-${entry.id}-${i}`} title="Dieta" onBack={pop}>
              <DietScreen
                dietId={entry.id}
                me={me}
                recipes={mine.recipes}
                onOpenProfile={openProfile}
                onCopied={(d) => replaceWithOwnDiet(d.id)}
                onDeleted={pop}
                onChanged={bumpDiets}
              />
            </PushedScreen>
) : entry.kind === 'activity' ? (
            <PushedScreen key={`activity-${i}`} title="Aktywność" onBack={pop}>
              <ActivityScreen arrivals={notes.arrivals} onSeen={onSeen} onOpenProfile={openProfile} onOpenRecipe={openRecipeById} />
            </PushedScreen>
          ) : (
            <PushedScreen
              key={`people-${entry.username}-${entry.list}-${i}`}
              title={entry.list === 'followers' ? 'Obserwujący' : 'Obserwowani'}
              onBack={pop}
            >
              <PeopleListScreen username={entry.username} kind={entry.list} onOpenProfile={openProfile} />
            </PushedScreen>
          ),
        )}
      </AnimatePresence>

      <AnimatePresence>
        {sheet?.kind === 'menu' && (
          <SettingsMenu
            key="menu"
            unread={notes.unread}
            onClose={() => setSheet(null)}
            onActivity={openActivity}
            onEditProfile={() => setSheet({ kind: 'edit-profile' })}
            onInterests={() => setSheet({ kind: 'interests' })}
            onCalories={isCreator(me.username) ? () => setSheet({ kind: 'calories' }) : undefined}
            onSignOut={onSignOut}
          />
        )}
        {sheet?.kind === 'add' && (
          <Sheet key="add" onClose={() => setSheet(null)}>
            <AddRecipeScreen
              onClose={() => setSheet(null)}
              onSave={async (draft) => {
                const created = await mine.add(draft)
                bump()
                changeTab('mine')
                return created
              }}
            />
          </Sheet>
        )}
        {sheet?.kind === 'edit' && (
          <Sheet key="edit" onClose={() => setSheet(null)}>
            <EditRecipeScreen
              recipe={sheet.recipe}
              onClose={() => setSheet(null)}
              onSave={async (id, draft) => {
                const updated = await mine.update(id, draft)
                bump()
                // Otwarty ekran szczegółów pokazuje od razu zmienioną wersję
                setStack((s) => s.map((e) => (e.kind === 'recipe' && e.recipe.id === id ? { kind: 'recipe', recipe: updated } : e)))
                return updated
              }}
            />
          </Sheet>
        )}
        {sheet?.kind === 'interests' && (
          <Sheet key="interests" onClose={() => setSheet(null)}>
            <InterestsScreen onClose={() => setSheet(null)} />
          </Sheet>
        )}
        {sheet?.kind === 'calories' && isCreator(me.username) && (
          <Sheet key="calories" onClose={() => setSheet(null)}>
            <CaloriesScreen
              username={me.username}
              recipes={mine.recipes}
              onSaveRecipe={saveAdaptedRecipe}
              onOpenDiet={(id) => {
                setSheet(null) // dieta wjeżdża na stos ekranów — arkusz musi się najpierw zamknąć, żeby było ją widać
                openDiet(id)
              }}
              dietVersion={dietVersion}
              onClose={() => setSheet(null)}
            />
          </Sheet>
        )}
        {sheet?.kind === 'comments' && (
          <Sheet key={`comments-${sheet.recipe.id}`} onClose={() => setSheet(null)}>
            <CommentsSheet
              recipeId={sheet.recipe.id}
              recipeTitle={sheet.recipe.title}
              isRecipeOwner={sheet.recipe.user_id === me.id}
              me={me}
              autoFocus={sheet.focus}
              onClose={() => setSheet(null)}
              onOpenAuthor={(username) => {
                setSheet(null) // arkusz jest ponad ekranami stosu, więc zamykamy go przed wejściem w profil
                openProfile(username)
              }}
            />
          </Sheet>
        )}
        {sheet?.kind === 'edit-profile' && (
          <Sheet key="edit-profile" onClose={() => setSheet(null)}>
            <EditProfileScreen
              me={me}
              onClose={() => setSheet(null)}
              onSaved={(updated) => {
                onMeChange(updated)
                bump()
              }}
            />
          </Sheet>
        )}
      </AnimatePresence>
      <NotificationToast
        notification={top?.kind === 'activity' ? null : notes.latest}
        onOpen={openActivity}
        onDismiss={notes.dismissLatest}
      />
    </div>
  )
}
