import { useEffect, useState, type ReactNode } from 'react'
import type { AdminSettings } from '@/lib/backend'
import { backend } from '@/lib/data'
import { emit } from '@/lib/events'
import { Field, Group, Toggle } from '@/components/formParts'
import { BanIcon, CheckIcon, FlameIcon, LockIcon } from '@/components/Icons'

interface Props {
  onClose: () => void
  onOpenCalories: () => void
  onOpenInvites: () => void
  onOpenBadges: () => void
  onOpenReports: () => void
}

/**
 * Panel admina: wszystkie ukryte funkcje dostępne tylko dla konta admina (tabela app_admins),
 * zebrane w jednym miejscu zamiast rozrzucone po Ustawieniach i profilu.
 */
export function AdminPanelScreen({ onClose, onOpenCalories, onOpenInvites, onOpenBadges, onOpenReports }: Props) {
  const [admin, setAdmin] = useState<AdminSettings | null>(null)
  const [adminError, setAdminError] = useState<string | null>(null)
  const [openReports, setOpenReports] = useState(0)

  useEffect(() => {
    let alive = true
    backend
      .getAdminSettings()
      .then((s) => alive && setAdmin(s))
      .catch(() => {})
    backend
      .countOpenReports()
      .then((n) => alive && setOpenReports(n))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  async function toggleTestAccounts(show: boolean) {
    if (!admin) return
    setAdminError(null)
    setAdmin({ ...admin, show_test_accounts: show })
    try {
      await backend.setShowTestAccounts(show)
      emit('visibility-changed') // feed i wyszukiwarka pobierają dane od nowa
    } catch (e) {
      setAdmin(admin)
      setAdminError(e instanceof Error ? e.message : 'Nie udało się zmienić ustawienia.')
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-11 shrink-0 items-center justify-between px-4">
        <span className="w-16" />
        <h2 className="text-[17px] font-semibold">Panel admina</h2>
        <button onClick={onClose} className="w-16 text-right text-[17px] font-semibold text-accent active:opacity-50">
          Gotowe
        </button>
      </header>
      <div className="scroll-y flex-1 space-y-5 px-4 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+24px)]">
        {admin && (
          <div>
            <Group>
              <Field label="Konta testowe">
                <span className="flex justify-end">
                  <Toggle checked={admin.show_test_accounts} onChange={(v) => void toggleTestAccounts(v)} label="Konta testowe" />
                </span>
              </Field>
            </Group>
            <p className="mt-1.5 px-4 text-[13px] text-label-2">
              {admin.test_accounts > 0
                ? `${admin.test_accounts} kont testowych z przepisami do testów aplikacji. Widzisz je tylko Ty, inni użytkownicy nie wiedzą o ich istnieniu. ${admin.show_test_accounts ? 'Wyłącz, żeby je ukryć.' : 'Są teraz ukryte także przed Tobą.'}`
                : 'W bazie nie ma jeszcze kont testowych. Uruchom supabase/test_accounts.sql w SQL Editorze Supabase.'}
            </p>
            {adminError && <p className="mt-1.5 px-4 text-[13px] text-red-500">{adminError}</p>}
          </div>
        )}

        <div>
          <Group>
            <Item icon={<BanIcon width={22} height={22} />} label="Zgłoszenia" badge={openReports} onClick={onOpenReports} />
            <Item icon={<CheckIcon width={22} height={22} />} label="Odznaki weryfikacji" onClick={onOpenBadges} />
            <Item icon={<LockIcon width={22} height={22} />} label="Kody zaproszeń" onClick={onOpenInvites} />
            <Item icon={<FlameIcon width={22} height={22} />} label="Licznik kalorii" onClick={onOpenCalories} />
          </Group>
        </div>
      </div>
    </div>
  )
}

function Item({ icon, label, badge, onClick }: { icon: ReactNode; label: string; badge?: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 border-b border-separator px-4 py-3.5 text-left text-[16px] last:border-b-0 active:bg-surface-2">
      {icon}
      <span className="flex-1">{label}</span>
      {!!badge && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[12px] font-bold text-white tabular-nums">{badge > 99 ? '99+' : badge}</span>
      )}
    </button>
  )
}
