import { useCallback, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Session } from '@supabase/supabase-js'
import type { Profile, Recipe } from '@/types/recipe'
import { backend, usesSupabase } from '@/lib/data'
import { supabase } from '@/lib/supabase'
import { spring } from '@/lib/ui'
import { useMe } from '@/hooks/useMe'
import { useNotifications } from '@/hooks/useNotifications'
import { useRecipes } from '@/hooks/useRecipes'
import { useSession } from '@/hooks/useSession'
import { MenuIcon } from '@/components/Icons'
import { LargeTitleScreen } from '@/components/LargeTitleScreen'
import { NotificationToast } from '@/components/NotificationToast'
import { PushedScreen } from '@/components/PushedScreen'
import { SettingsMenu } from '@/components/SettingsMenu'
import { Sheet } from '@/components/Sheet'
import { TabBar, type Tab } from '@/components/TabBar'
import { ActivityScreen } from '@/screens/ActivityScreen'
import { AddRecipeScreen } from '@/screens/AddRecipeScreen'
import { EditProfileScreen } from '@/screens/EditProfileScreen'
import { EditRecipeScreen } from '@/screens/EditRecipeScreen'
import { FeedScreen } from '@/screens/FeedScreen'
import { LoginScreen } from '@/screens/LoginScreen'
import { PeopleListScreen, type ListKind } from '@/screens/PeopleListScreen'
import { ProfileSetupScreen } from '@/screens/ProfileSetupScreen'
import { ProfileView } from '@/screens/ProfileView'
import { RecipeDetailScreen } from '@/screens/RecipeDetailScreen'
import { RecipeListScreen } from '@/screens/RecipeListScreen'
import { SearchScreen } from '@/screens/SearchScreen'

export default function App() {
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

  if (status === 'loading') return <div className="fixed inset-0 bg-bg" />

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

type SheetState = { kind: 'add' } | { kind: 'menu' } | { kind: 'edit'; recipe: Recipe } | { kind: 'edit-profile' } | null

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
  const { markRead } = notes
  const onSeen = useCallback(() => void markRead(), [markRead])

  const top = stack[stack.length - 1]
  const screen = (id: Tab, node: React.ReactNode) =>
    visited.has(id) && (
      <div className={`absolute inset-0 ${tab === id ? '' : 'invisible pointer-events-none'}`} aria-hidden={tab !== id} inert={tab !== id}>
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
        {screen('feed', <FeedScreen onOpenRecipe={openRecipe} onOpenProfile={openProfile} onGoSearch={() => changeTab('search')} />)}
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
            />
          </LargeTitleScreen>,
        )}
      </motion.div>

      <TabBar tab={tab} onChange={changeTab} badges={{ profile: notes.unread }} />

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
            />
          ) : entry.kind === 'profile' ? (
            <PushedScreen key={`profile-${entry.username}-${i}`} title={`@${entry.username}`} onBack={pop}>
              <div className="px-[max(16px,env(safe-area-inset-left))]">
                <ProfileView
                  username={entry.username}
                  onOpenRecipe={openRecipe}
                  onOpenList={(kind) => openList(entry.username, kind)}
                />
              </div>
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
