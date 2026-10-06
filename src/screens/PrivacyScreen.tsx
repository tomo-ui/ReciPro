import { useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import type { Profile } from '@/types/recipe'
import type { BlockedUser } from '@/types/moderation'
import { backend } from '@/lib/data'
import { emit } from '@/lib/events'
import { LEGAL } from '@/lib/legal'
import { useAiConsent } from '@/hooks/useAiConsent'
import { usePaged } from '@/hooks/usePaged'
import { AiConsentDialog } from '@/components/AiConsentDialog'
import { Avatar } from '@/components/Avatar'
import { DeleteAccountPanel } from '@/components/DeleteAccountPanel'
import { Group, Toggle } from '@/components/formParts'
import { BanIcon, ChevronLeftIcon, FileTextIcon, LockIcon, SparkleIcon, TrashIcon } from '@/components/Icons'
import { LoadMore } from '@/components/LoadMore'

interface Props {
  me: Profile
  onClose: () => void
}

type View = 'main' | 'blocked' | 'delete'

const TITLES: Record<View, string> = { main: 'Prywatność', blocked: 'Zablokowani', delete: 'Usuń konto' }

/**
 * Ustawienia → Prywatność i bezpieczeństwo: zgoda na AI, zablokowani użytkownicy, regulamin i polityka prywatności
 * (wymóg sklepów: dostęp z poziomu aplikacji) oraz usunięcie konta.
 */
export function PrivacyScreen({ me, onClose }: Props) {
  const [view, setView] = useState<View>('main')
  const consent = useAiConsent()
  const [asking, setAsking] = useState(false)
  const [consentError, setConsentError] = useState<string | null>(null)

  async function toggleConsent(next: boolean) {
    if (next) return setAsking(true) // włączenie przechodzi przez okno z opisem, tak samo jak przy pierwszym imporcie
    setConsentError(null)
    try {
      await consent.set(false)
    } catch (e) {
      setConsentError(e instanceof Error ? e.message : 'Nie udało się zapisać zmiany.')
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="relative flex h-11 shrink-0 items-center justify-center px-4">
        {view !== 'main' && (
          <button onClick={() => setView('main')} aria-label="Wróć" className="absolute left-2 flex h-9 items-center text-accent active:opacity-50">
            <ChevronLeftIcon />
          </button>
        )}
        <h2 className="max-w-[55%] truncate text-[17px] font-semibold">{TITLES[view]}</h2>
        <button onClick={onClose} className="absolute right-4 text-[17px] font-semibold text-accent active:opacity-50">
          Gotowe
        </button>
      </header>

      <div className="scroll-y flex-1 px-4 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+24px)]">
        {view === 'main' && (
          <div className="space-y-5">
            <div>
              <Group>
                <label className="flex items-center gap-3 px-4 py-3">
                  <SparkleIcon width={22} height={22} className="shrink-0 text-label-2" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px]">Import z pomocą AI</span>
                    <span className="block text-[12px] text-label-2">Zgoda na przetwarzanie importowanych treści przez Google Gemini</span>
                  </span>
                  <Toggle checked={consent.granted === true} onChange={(v) => void toggleConsent(v)} label="Import z pomocą AI" />
                </label>
              </Group>
              <p className="mt-1.5 px-4 text-[13px] text-label-2">
                Bez zgody import z linku, tekstu i zdjęcia jest wyłączony. Przepisy możesz wtedy dodawać ręcznie.
              </p>
              {consentError && <p className="mt-1.5 px-4 text-[13px] text-red-500">{consentError}</p>}
            </div>

            <Group>
              <Row icon={<BanIcon width={22} height={22} />} label="Zablokowani użytkownicy" onClick={() => setView('blocked')} />
            </Group>

            <Group>
              <Row icon={<FileTextIcon width={22} height={22} />} label="Regulamin" href={LEGAL.terms} />
              <Row icon={<LockIcon width={22} height={22} />} label="Polityka prywatności" href={LEGAL.privacy} />
            </Group>

            <Group>
              <Row icon={<TrashIcon width={22} height={22} />} label="Usuń konto" danger onClick={() => setView('delete')} />
            </Group>
          </div>
        )}

        {view === 'blocked' && <BlockedList />}
        {view === 'delete' && <DeleteAccountPanel username={me.username} />}
      </div>

      {asking && (
        <AiConsentDialog
          onAccept={async () => {
            await consent.set(true)
            setAsking(false)
          }}
          onDecline={() => setAsking(false)}
        />
      )}
    </div>
  )
}

function BlockedList() {
  const list = usePaged<BlockedUser>((offset, limit) => backend.listBlockedUsers(offset, limit), [], 30)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function unblock(u: BlockedUser) {
    setBusyId(u.id)
    setError(null)
    try {
      await backend.unblockUser(u.id)
      list.setItems((items) => items.filter((x) => x.id !== u.id))
      emit('visibility-changed') // feed i wyszukiwarka pokażą tę osobę od nowa
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się odblokować.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      {list.items.length > 0 && (
        <Group>
          {list.items.map((u) => (
            <div key={u.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar name={u.username} src={u.avatar_url} size={38} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] font-semibold">{u.username}</span>
                {u.full_name && <span className="block truncate text-[13px] text-label-2">{u.full_name}</span>}
              </span>
              <motion.button
                whileTap={{ scale: 0.95 }}
                disabled={busyId === u.id}
                onClick={() => void unblock(u)}
                className="rounded-full bg-surface-2 px-3.5 py-1.5 text-[14px] font-semibold disabled:opacity-50"
              >
                Odblokuj
              </motion.button>
            </div>
          ))}
        </Group>
      )}
      {list.items.length === 0 && !list.loading && !list.error && (
        <p className="pt-10 text-center text-[15px] text-label-2">Nie zablokowałeś(-aś) nikogo.</p>
      )}
      {error && <p className="px-1 pt-3 text-[14px] text-red-500">{error}</p>}
      <LoadMore loading={list.loading} done={list.done} error={list.error} onLoadMore={list.loadMore} onRetry={list.retry} />
    </div>
  )
}

function Row({ icon, label, onClick, href, danger }: { icon: ReactNode; label: string; onClick?: () => void; href?: string; danger?: boolean }) {
  const cls = `flex w-full items-center gap-3 px-4 py-3.5 text-left text-[16px] active:bg-surface-2 ${danger ? 'text-red-500' : ''}`
  const body = (
    <>
      {icon}
      <span className="flex-1">{label}</span>
    </>
  )
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
      {body}
    </a>
  ) : (
    <button onClick={onClick} className={cls}>
      {body}
    </button>
  )
}
