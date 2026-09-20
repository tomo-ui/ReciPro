import { useEffect, useRef, useState } from 'react'
import type { ProfileSummary } from '@/types/recipe'
import { backend } from '@/lib/data'
import { usePaged } from '@/hooks/usePaged'
import { LockIcon, SpinnerIcon } from '@/components/Icons'
import { LoadMore } from '@/components/LoadMore'
import { PersonRow } from '@/components/PersonRow'

export type ListKind = 'followers' | 'following'

/** Tyle po własnej zmianie ignorujemy odświeżanie listy z powodu zmiany licznika (zdarzenie z serwera dociera z opóźnieniem) */
const LOCAL_CHANGE_QUIET_MS = 5000

interface Props {
  username: string
  kind: ListKind
  onOpenProfile: (username: string) => void
}

/** Lista obserwujących albo obserwowanych danego profilu; odświeża się sama, gdy zmienią się jego liczniki */
export function PeopleListScreen({ username, kind, onOpenProfile }: Props) {
  const [profile, setProfile] = useState<ProfileSummary | null | undefined>(undefined)

  useEffect(() => {
    let alive = true
    backend
      .getProfile(username)
      .then((p) => alive && setProfile(p))
      .catch(() => alive && setProfile(null))
    return () => {
      alive = false
    }
  }, [username])

  const allowed = !!profile && (profile.is_public || profile.is_me)
  const people = usePaged(
    (o, l) => (kind === 'followers' ? backend.listFollowers(username, o, l) : backend.listFollowing(username, o, l)),
    [username, kind],
    30,
    allowed,
  )

  // Po własnym (od)obserwowaniu z tej listy wiersz zostaje do wyjścia z widoku, więc nie przeładowujemy jej
  // w odpowiedzi na licznik, który zmienił się przez nas
  const lastLocalChange = useRef(0)

  // Na żywo: zmiana licznika oznacza zmianę listy
  const profileId = profile?.id
  useEffect(() => {
    if (!profileId || !allowed) return
    let last: string | undefined
    return backend.subscribeProfileCounts(profileId, (c) => {
      setProfile((p) => (p ? { ...p, followers_count: c.followers_count, following_count: c.following_count } : p))
      const signature = `${c.followers_count}/${c.following_count}`
      if (signature !== last) {
        last = signature
        if (Date.now() - lastLocalChange.current > LOCAL_CHANGE_QUIET_MS) people.reload()
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, allowed, kind])

  if (profile === undefined) {
    return (
      <div className="flex justify-center pt-24 text-label-2">
        <SpinnerIcon width={24} height={24} />
      </div>
    )
  }
  if (profile === null) return <p className="px-6 pt-24 text-center text-[16px] text-label-2">Nie znaleziono użytkownika.</p>
  if (!allowed) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 pt-24 text-center">
        <LockIcon width={32} height={32} className="text-label-2" />
        <p className="text-[17px] font-semibold">Ta lista jest prywatna</p>
        <p className="text-[14px] text-label-2">Widzi ją tylko właściciel profilu.</p>
      </div>
    )
  }

  const total = kind === 'followers' ? profile.followers_count : profile.following_count
  const setFollowing = (id: string, following: boolean) => {
    lastLocalChange.current = Date.now()
    people.setItems((items) =>
      items.map((x) => (x.id === id ? { ...x, is_following: following, followers_count: x.followers_count + (following ? 1 : -1) } : x)),
    )
  }

  return (
    <div className="px-[max(16px,env(safe-area-inset-left))] pt-4">
      <p className="mb-2 px-1 text-[13px] font-semibold text-label-2 uppercase">
        {kind === 'followers' ? 'Obserwujący' : 'Obserwowani'} · <span className="tabular-nums">{total}</span>
      </p>
      {people.items.length === 0 && !people.loading && !people.error ? (
        <p className="pt-12 text-center text-[15px] text-label-2">
          {kind === 'followers' ? 'Nikt jeszcze nie obserwuje tego profilu.' : 'Ten profil nikogo jeszcze nie obserwuje.'}
        </p>
      ) : (
        <ul className="divide-y divide-separator overflow-hidden rounded-[14px] bg-surface">
          {people.items.map((p) => (
            <PersonRow key={p.id} person={p} onOpen={() => onOpenProfile(p.username)} onFollowChange={(f) => setFollowing(p.id, f)} />
          ))}
        </ul>
      )}
      <LoadMore loading={people.loading} done={people.done} error={people.error} onLoadMore={people.loadMore} onRetry={people.retry} />
    </div>
  )
}
