import { useState } from 'react'
import { motion } from 'framer-motion'
import { backend } from '@/lib/data'
import { reportReasonLabel, type ModerationReport, type ReportResolution } from '@/types/moderation'
import { timeAgo } from '@/lib/ui'
import { usePaged } from '@/hooks/usePaged'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { SpinnerIcon } from '@/components/Icons'
import { LoadMore } from '@/components/LoadMore'
import { SegmentedControl } from '@/components/SegmentedControl'

interface Props {
  onClose: () => void
  /** Liczba otwartych zgłoszeń zmieniła się (badge w panelu admina) */
  onChanged?: () => void
}

type Filter = 'open' | 'closed'

const TARGET_LABEL = { recipe: 'Przepis', comment: 'Komentarz', profile: 'Profil' } as const
const ACTION_LABEL: Record<string, string> = { dismiss: 'Odrzucone', remove_content: 'Treść usunięta', remove_account: 'Konto usunięte' }

/**
 * Panel moderacji (tylko admin): zgłoszone przepisy, komentarze i profile. Otwarte od najstarszych — czas reakcji
 * liczy się od zgłoszenia, a regulamin obiecuje odpowiedź zwykle w 24 h. Akcje: odrzuć, usuń treść, usuń konto autora.
 */
export function ReportsScreen({ onClose, onChanged }: Props) {
  const [filter, setFilter] = useState<Filter>('open')
  const list = usePaged<ModerationReport>(
    async (offset, limit) => {
      if (filter === 'open') return backend.listReports('open', offset, limit)
      // „Zamknięte” = rozstrzygnięte + odrzucone, od najnowszych
      const [resolved, dismissed] = await Promise.all([backend.listReports('resolved', offset, limit), backend.listReports('dismissed', offset, limit)])
      return [...resolved, ...dismissed].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit)
    },
    [filter],
    20,
  )
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<ModerationReport | null>(null)

  async function resolve(report: ModerationReport, action: ReportResolution) {
    setBusyId(report.id)
    setError(null)
    try {
      await backend.resolveReport(report.id, action)
      await list.reload()
      onChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się zamknąć zgłoszenia.')
    } finally {
      setBusyId(null)
    }
  }

  async function removeAccount(report: ModerationReport) {
    if (!report.target_user_id) return
    setRemoving(null)
    setBusyId(report.id)
    setError(null)
    try {
      await backend.removeUserAccount(report.target_user_id)
      await list.reload()
      onChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się usunąć konta.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-11 shrink-0 items-center justify-between px-4">
        <span className="w-16" />
        <h2 className="text-[17px] font-semibold">Zgłoszenia</h2>
        <button onClick={onClose} className="w-16 text-right text-[17px] font-semibold text-accent active:opacity-50">
          Gotowe
        </button>
      </header>
      <div className="scroll-y flex-1 space-y-3 px-4 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+24px)]">
        <SegmentedControl<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'open', label: 'Otwarte' },
            { value: 'closed', label: 'Zamknięte' },
          ]}
        />
        {error && <p className="rounded-[12px] bg-surface px-4 py-3 text-[14px] text-red-500">{error}</p>}

        {list.items.map((r) => (
          <article key={r.id} className="space-y-2 rounded-[16px] bg-surface px-4 py-3.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
              <span className="rounded-full bg-accent/15 px-2 py-0.5 font-semibold text-accent">{TARGET_LABEL[r.target_type]}</span>
              <span className="font-medium">{reportReasonLabel(r.reason)}</span>
              <span className="text-label-2">· {timeAgo(r.created_at)}</span>
              {r.reports_count > 1 && <span className="rounded-full bg-red-500/15 px-2 py-0.5 font-semibold text-red-500">{r.reports_count} zgłoszeń</span>}
            </div>
            {r.excerpt && <p className="rounded-[10px] bg-surface-2 px-3 py-2 text-[14px] break-words whitespace-pre-wrap">{r.excerpt}</p>}
            {r.details && <p className="text-[13px] text-label-2">„{r.details}”</p>}
            <p className="text-[12px] text-label-2">
              Autor: {r.target_username ? `@${r.target_username}` : 'konto usunięte'} · zgłosił(a): {r.reporter_username ? `@${r.reporter_username}` : '—'}
            </p>

            {r.status === 'open' ? (
              <div className="flex flex-wrap gap-2 pt-1">
                <Action busy={busyId === r.id} onClick={() => void resolve(r, 'dismiss')}>
                  Odrzuć
                </Action>
                {r.target_type !== 'profile' && (
                  <Action busy={busyId === r.id} danger onClick={() => void resolve(r, 'remove_content')}>
                    Usuń treść
                  </Action>
                )}
                {r.target_user_id && (
                  <Action busy={busyId === r.id} danger onClick={() => setRemoving(r)}>
                    Usuń konto autora
                  </Action>
                )}
              </div>
            ) : (
              <p className="pt-0.5 text-[13px] font-semibold text-label-2">{ACTION_LABEL[r.action ?? ''] ?? 'Zamknięte'}</p>
            )}
          </article>
        ))}

        {list.items.length === 0 && !list.loading && !list.error && (
          <p className="pt-10 text-center text-[15px] text-label-2">{filter === 'open' ? 'Brak otwartych zgłoszeń. 🎉' : 'Brak zamkniętych zgłoszeń.'}</p>
        )}
        <LoadMore loading={list.loading} done={list.done} error={list.error} onLoadMore={list.loadMore} onRetry={list.retry} />
      </div>

      {removing && (
        <ConfirmDialog
          title={`Usunąć konto @${removing.target_username ?? 'autora'}?`}
          message="Konto, wszystkie jego przepisy, komentarze i dane zostaną usunięte na stałe. Tego nie da się cofnąć."
          confirmLabel="Usuń konto"
          onConfirm={() => void removeAccount(removing)}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>
  )
}

function Action({ children, onClick, busy, danger }: { children: string; onClick: () => void; busy: boolean; danger?: boolean }) {
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      disabled={busy}
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full bg-surface-2 px-3.5 py-1.5 text-[14px] font-semibold disabled:opacity-50 ${danger ? 'text-red-500' : ''}`}
    >
      {busy && <SpinnerIcon width={14} height={14} />}
      {children}
    </motion.button>
  )
}
