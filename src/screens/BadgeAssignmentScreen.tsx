import { useState } from 'react'
import type { ProfileSummary } from '@/types/recipe'
import { BADGE_TIERS, type VerifiedBadgeTier } from '@/lib/badgeTiers'
import { backend } from '@/lib/data'
import { useDebounced } from '@/hooks/useDebounced'
import { usePaged } from '@/hooks/usePaged'
import { Avatar } from '@/components/Avatar'
import { VerifiedBadge } from '@/components/VerifiedBadge'
import { LoadMore } from '@/components/LoadMore'
import { SearchIcon, SpinnerIcon, XIcon } from '@/components/Icons'

interface Props {
  onClose: () => void
}

const TIERS = Object.keys(BADGE_TIERS) as VerifiedBadgeTier[]

/** Wyszukanie użytkownika i przyznanie mu znaczka weryfikacji (albo odebranie — opcja „Brak”) */
export function BadgeAssignmentScreen({ onClose }: Props) {
  const [text, setText] = useState('')
  const query = useDebounced(text.trim(), 300)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const people = usePaged((o, l) => backend.searchProfiles(query, o, l), [query], 20, query.length > 0)

  async function assign(person: ProfileSummary, badge: VerifiedBadgeTier | null) {
    setBusy(person.id)
    setError(null)
    try {
      await backend.setVerifiedBadge(person.username, badge)
      people.setItems((list) => list.map((p) => (p.id === person.id ? { ...p, verified_badge: badge } : p)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się zmienić znaczka.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-11 shrink-0 items-center justify-between px-4">
        <span className="w-16" />
        <h2 className="text-[17px] font-semibold">Odznaki weryfikacji</h2>
        <button onClick={onClose} className="w-16 text-right text-[17px] font-semibold text-accent active:opacity-50">
          Gotowe
        </button>
      </header>
      <div className="scroll-y flex-1 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+24px)]">
        <label className="mb-3 flex items-center gap-2 rounded-[10px] bg-surface-2 px-2.5 py-2 text-label-2">
          <SearchIcon width={17} height={17} />
          <input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Nazwa użytkownika lub imię i nazwisko"
            autoCapitalize="none"
            autoCorrect="off"
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-label outline-none placeholder:text-label-2"
          />
          {text && (
            <button onClick={() => setText('')} aria-label="Wyczyść" className="text-label-2">
              <XIcon width={16} height={16} />
            </button>
          )}
        </label>

        {error && <p className="pb-3 text-center text-[14px] text-red-500">{error}</p>}

        {query.length === 0 ? (
          <p className="pt-8 text-center text-[14px] text-label-2">Zacznij pisać, żeby znaleźć użytkownika.</p>
        ) : (
          <>
            <ul className="divide-y divide-separator overflow-hidden rounded-[14px] bg-surface">
              {people.items.map((p) => (
                <li key={p.id} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={p.username} src={p.avatar_url} size={40} />
                    <p className="flex min-w-0 flex-1 items-center text-[15px] font-semibold">
                      <span className="truncate">{p.username}</span>
                      <VerifiedBadge badge={p.verified_badge} size={14} />
                    </p>
                    {busy === p.id && <SpinnerIcon width={16} height={16} className="text-label-2" />}
                  </div>
                  <div className="mt-2.5 flex gap-2">
                    <button
                      onClick={() => void assign(p, null)}
                      disabled={busy === p.id}
                      className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-[11px] text-label-2 disabled:opacity-40 ${!p.verified_badge ? 'border-accent' : 'border-transparent bg-surface-2'}`}
                      aria-label="Brak znaczka"
                    >
                      ×
                    </button>
                    {TIERS.map((tier) => (
                      <button
                        key={tier}
                        onClick={() => void assign(p, tier)}
                        disabled={busy === p.id}
                        aria-label={BADGE_TIERS[tier].label}
                        title={BADGE_TIERS[tier].label}
                        className={`h-7 w-7 rounded-full border-2 disabled:opacity-40 ${p.verified_badge === tier ? 'border-label' : 'border-transparent'}`}
                        style={{ backgroundColor: BADGE_TIERS[tier].color }}
                      />
                    ))}
                  </div>
                </li>
              ))}
            </ul>
            {people.items.length === 0 && !people.loading && !people.error && (
              <p className="pt-8 text-center text-[14px] text-label-2">Nikogo nie znaleziono.</p>
            )}
            <LoadMore loading={people.loading} done={people.done} error={people.error} onLoadMore={people.loadMore} onRetry={people.retry} />
          </>
        )}
      </div>
    </div>
  )
}
