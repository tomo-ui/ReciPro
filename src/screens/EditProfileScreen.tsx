import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { Profile } from '@/types/recipe'
import { backend } from '@/lib/data'
import { deleteRecipeImage, fileToAvatarBlob, uploadAvatarImage } from '@/lib/images'
import { BIO_MAX_LENGTH, BIO_MAX_LINES, normalizeBio, normalizeFullName, normalizeUsername } from '@/lib/username'
import { useUsernameCheck } from '@/hooks/useUsernameCheck'
import { Avatar } from '@/components/Avatar'
import { Field, Group, Toggle } from '@/components/formParts'
import { SpinnerIcon } from '@/components/Icons'
import { UsernameInput } from '@/components/UsernameInput'

interface Props {
  me: Profile
  onClose: () => void
  onSaved: (me: Profile) => void
}

/** Ogranicza wpisywany opis do 150 znaków i 5 linii (bez przycinania spacji, żeby dało się swobodnie pisać) */
function limitBio(v: string): string {
  return v.replace(/\r\n?/g, '\n').split('\n').slice(0, BIO_MAX_LINES).join('\n').slice(0, BIO_MAX_LENGTH)
}

/** Edycja profilu: zdjęcie profilowe, nazwa użytkownika, imię i nazwisko, prywatność */
export function EditProfileScreen({ me, onClose, onSaved }: Props) {
  const [username, setUsername] = useState(me.username)
  const [fullName, setFullName] = useState(me.full_name ?? '')
  const [bio, setBio] = useState(me.bio ?? '')
  const [isPublic, setIsPublic] = useState(me.is_public)
  const [allowZoom, setAllowZoom] = useState(me.allow_avatar_zoom !== false)
  const [pending, setPending] = useState<{ blob: Blob; preview: string } | null>(null)
  const [removeAvatar, setRemoveAvatar] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const status = useUsernameCheck(username, me.username)

  const canSave = status.state === 'ok' && !saving && !avatarBusy

  // Zwolnienie adresu podglądu po zamknięciu
  const previewRef = useRef<string | null>(null)
  previewRef.current = pending?.preview ?? null
  useEffect(() => () => void (previewRef.current && URL.revokeObjectURL(previewRef.current)), [])

  async function pickAvatar(file: File) {
    setAvatarError(null)
    if (!file.type.startsWith('image/')) return setAvatarError('Wybierz plik ze zdjęciem.')
    setAvatarBusy(true)
    try {
      const blob = await fileToAvatarBlob(file)
      setPending((old) => {
        if (old) URL.revokeObjectURL(old.preview)
        return { blob, preview: URL.createObjectURL(blob) }
      })
      setRemoveAvatar(false)
    } catch (e) {
      setAvatarError(e instanceof Error ? e.message : 'Nie udało się przetworzyć zdjęcia.')
    } finally {
      setAvatarBusy(false)
    }
  }

  function dropAvatar() {
    setPending((old) => {
      if (old) URL.revokeObjectURL(old.preview)
      return null
    })
    setRemoveAvatar(true)
  }

  async function save() {
    if (!canSave) return
    setSaving(true)
    setError(null)
    let uploaded: string | undefined
    try {
      const patch: Parameters<typeof backend.updateProfile>[0] = {
        full_name: normalizeFullName(fullName) ?? null,
        is_public: isPublic,
      }
      if (normalizeUsername(username) !== me.username) patch.username = username
      // opis wysyłamy tylko po zmianie, żeby zapis profilu działał też przed aktualizacją bazy o kolumnę bio
      if ((normalizeBio(bio) ?? '') !== (me.bio ?? '')) patch.bio = normalizeBio(bio) ?? null
      // jak przy opisie: tylko po zmianie, żeby zapis działał też przed aktualizacją bazy
      if (allowZoom !== (me.allow_avatar_zoom !== false)) patch.allow_avatar_zoom = allowZoom
      if (pending) {
        uploaded = await uploadAvatarImage(pending.blob)
        patch.avatar_url = uploaded
      } else if (removeAvatar) {
        patch.avatar_url = null
      }

      let updated: Profile
      try {
        updated = await backend.updateProfile(patch)
      } catch (e) {
        if (uploaded) await deleteRecipeImage(uploaded) // nie zostawiamy zdjęcia bez profilu
        throw e
      }
      if ((pending || removeAvatar) && me.avatar_url && me.avatar_url !== updated.avatar_url) {
        await deleteRecipeImage(me.avatar_url) // poprzednie zdjęcie przestaje zajmować miejsce
      }
      onSaved(updated)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się zapisać profilu.')
      setSaving(false)
    }
  }

  const shownSrc = pending?.preview ?? (removeAvatar ? undefined : me.avatar_url)

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

        <div className="flex flex-col items-center gap-3 pt-1">
          <div className="relative">
            <Avatar name={username || me.username} src={shownSrc} size={96} />
            {avatarBusy && (
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white">
                <SpinnerIcon width={26} height={26} />
              </span>
            )}
          </div>
          <div className="flex gap-4 text-[15px] font-semibold">
            <motion.button type="button" whileTap={{ scale: 0.95 }} onClick={() => fileRef.current?.click()} className="text-accent">
              {shownSrc ? 'Zmień zdjęcie' : 'Dodaj zdjęcie'}
            </motion.button>
            {shownSrc && (
              <motion.button type="button" whileTap={{ scale: 0.95 }} onClick={dropAvatar} className="text-red-500">
                Usuń
              </motion.button>
            )}
          </div>
          {avatarError && <p className="text-[13px] text-red-500">{avatarError}</p>}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void pickAvatar(file)
            }}
          />
        </div>

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
          <p className="mb-1.5 px-4 text-[13px] text-label-2 uppercase">Opis</p>
          <Group>
            <textarea
              value={bio}
              onChange={(e) => setBio(limitBio(e.target.value))}
              placeholder="Napisz kilka słów o sobie"
              rows={4}
              className="block w-full resize-none bg-transparent px-4 py-3.5 leading-snug outline-none placeholder:text-label-3"
            />
          </Group>
          <p className="mt-1.5 px-4 text-right text-[13px] text-label-2 tabular-nums">
            {bio.length}/{BIO_MAX_LENGTH}
          </p>
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

        <div>
          <Group>
            <Field label="Powiększanie zdjęcia">
              <span className="flex justify-end">
                <Toggle checked={allowZoom} onChange={setAllowZoom} label="Powiększanie zdjęcia profilowego" />
              </span>
            </Field>
          </Group>
          <p className="mt-1.5 px-4 text-[13px] text-label-2">
            {allowZoom ? 'Inni mogą dotknąć Twojego zdjęcia profilowego, żeby zobaczyć je w dużym formacie.' : 'Dotknięcie Twojego zdjęcia profilowego nic nie robi. Ty nadal możesz je powiększyć.'}
          </p>
        </div>
      </div>
    </div>
  )
}
