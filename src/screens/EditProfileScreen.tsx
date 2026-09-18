import { useState } from 'react'
import type { Profile } from '@/types/recipe'
import { backend } from '@/lib/data'
import { normalizeFullName, normalizeUsername } from '@/lib/username'
import { useUsernameCheck } from '@/hooks/useUsernameCheck'
import { Field, Group, Toggle } from '@/components/formParts'
import { UsernameInput } from '@/components/UsernameInput'

interface Props {
  me: Profile
  onClose: () => void
  onSaved: (me: Profile) => void
}

/** Edycja profilu: nazwa użytkownika, imię i nazwisko, prywatność */
export function EditProfileScreen({ me, onClose, onSaved }: Props) {
  const [username, setUsername] = useState(me.username)
  const [fullName, setFullName] = useState(me.full_name ?? '')
  const [isPublic, setIsPublic] = useState(me.is_public)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const status = useUsernameCheck(username, me.username)

  const canSave = status.state === 'ok' && !saving

  async function save() {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      const patch: Parameters<typeof backend.updateProfile>[0] = {
        full_name: normalizeFullName(fullName) ?? null,
        is_public: isPublic,
      }
      if (normalizeUsername(username) !== me.username) patch.username = username
      onSaved(await backend.updateProfile(patch))
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się zapisać profilu.')
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-11 shrink-0 items-center justify-between px-4">
        <button onClick={onClose} className="text-[17px] text-accent active:opacity-50">
          Anuluj
        </button>
        <h2 className="text-[17px] font-semibold">Edytuj profil</h2>
        <button
          onClick={save}
          disabled={!canSave}
          className="text-[17px] font-semibold text-accent transition-opacity active:opacity-50 disabled:opacity-35"
        >
          Zapisz
        </button>
      </header>

      <div className="scroll-y flex-1 space-y-5 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+32px)]">
        {error && <p className="rounded-[12px] bg-surface px-4 py-3 text-[14px] text-red-500">{error}</p>}

        <div>
          <p className="mb-1.5 px-4 text-[13px] text-label-2 uppercase">Nazwa użytkownika</p>
          <Group>
            <UsernameInput value={username} onChange={setUsername} status={status} />
          </Group>
        </div>

        <div>
          <p className="mb-1.5 px-4 text-[13px] text-label-2 uppercase">Imię i nazwisko</p>
          <Group>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Opcjonalnie"
              maxLength={60}
              className="w-full bg-transparent px-4 py-3.5 outline-none placeholder:text-label-3"
            />
          </Group>
        </div>

        <div>
          <Group>
            <Field label="Profil publiczny">
              <span className="flex justify-end">
                <Toggle checked={isPublic} onChange={setIsPublic} label="Profil publiczny" />
              </span>
            </Field>
          </Group>
          <p className="mt-1.5 px-4 text-[13px] text-label-2">
            {isPublic
              ? 'Inni widzą Twoje przepisy, znajdą je w wyszukiwarce i mogą Cię obserwować.'
              : 'Twoje przepisy są widoczne tylko dla Ciebie. Profil (nazwa i imię) nadal można znaleźć w wyszukiwarce.'}
          </p>
        </div>
      </div>
    </div>
  )
}
