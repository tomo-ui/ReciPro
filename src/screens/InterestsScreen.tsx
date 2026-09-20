import { useEffect, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { backend } from '@/lib/data'
import { emit } from '@/lib/events'
import { fold } from '@/lib/text'
import { INTEREST_MAX_LENGTH, INTERESTS_MAX, SUGGESTED_INTERESTS, normalizeInterest, normalizeInterests } from '@/lib/interests'
import { PlusIcon, SpinnerIcon, XIcon } from '@/components/Icons'

interface Props {
  onClose: () => void
}

/**
 * Zainteresowania: co lubisz jeść i gotować. Razem z polubieniami i obserwowanymi kształtują feed „Dla Ciebie”.
 * Lista jest prywatna — widzi ją tylko właściciel konta.
 */
export function InterestsScreen({ onClose }: Props) {
  const [selected, setSelected] = useState<string[] | null>(null) // null = wczytywanie
  const [initial, setInitial] = useState<string[]>([])
  const [popular, setPopular] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    backend
      .getInterests()
      .then((list) => {
        if (!alive) return
        setSelected(list)
        setInitial(list)
      })
      .catch((e: unknown) => {
        if (!alive) return
        setSelected([])
        setError(e instanceof Error ? e.message : 'Nie udało się wczytać zainteresowań.')
      })
    backend
      .popularTags(16)
      .then((tags) => alive && setPopular(tags.map((t) => t.tag)))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const list = selected ?? []
  const has = (t: string) => list.some((x) => fold(x) === fold(t))
  const full = list.length >= INTERESTS_MAX
  const changed = selected !== null && normalizeInterests(list).join('\n') !== initial.join('\n')

  const add = (raw: string) => {
    const t = normalizeInterest(raw)
    if (!t || has(t) || full) return
    setSelected((s) => [...(s ?? []), t])
  }
  const remove = (t: string) => setSelected((s) => (s ?? []).filter((x) => x !== t))

  function submitDraft(e: FormEvent) {
    e.preventDefault()
    add(draft)
    setDraft('')
  }

  async function save() {
    if (saving || selected === null) return
    setSaving(true)
    setError(null)
    try {
      await backend.setInterests(list)
      emit('interests-changed') // feed Dla Ciebie pobiera się od nowa
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się zapisać zainteresowań.')
      setSaving(false)
    }
  }

  // Propozycje: najpierw popularne tagi z przepisów w aplikacji, potem lista podstawowa; bez już wybranych
  const suggestions = [...new Set([...popular, ...SUGGESTED_INTERESTS])].filter((t) => !has(t)).slice(0, 36)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-11 shrink-0 items-center justify-between px-4">
        <button onClick={onClose} className="text-[17px] text-accent active:opacity-50">
          Anuluj
        </button>
        <h2 className="text-[17px] font-semibold">Zainteresowania</h2>
        <button
          onClick={save}
          disabled={!changed || saving}
          className="flex items-center gap-1.5 text-[17px] font-semibold text-accent transition-opacity active:opacity-50 disabled:opacity-35"
        >
          {saving && <SpinnerIcon width={15} height={15} />}
          Zapisz
        </button>
      </header>

      <div className="scroll-y flex-1 space-y-5 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+32px)]">
        {error && <p className="rounded-[12px] bg-surface px-4 py-3 text-[14px] text-red-500">{error}</p>}

        <p className="px-1 text-[14px] leading-snug text-label-2">
          Wybierz, co lubisz jeść i gotować. W feedzie „Dla Ciebie” pokażemy przepisy pasujące do tych zainteresowań, także od osób, których jeszcze nie
          obserwujesz. Wpływają na to też przepisy, które polubisz. Ta lista jest prywatna.
        </p>

        <form onSubmit={submitDraft} className="flex items-center gap-2">
          <div className="min-w-0 flex-1 overflow-hidden rounded-[14px] bg-surface">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Dodaj własne, np. tiramisu"
              maxLength={INTEREST_MAX_LENGTH}
              autoCapitalize="none"
              enterKeyHint="done"
              disabled={full}
              className="w-full bg-transparent px-4 py-3.5 outline-none placeholder:text-label-3"
            />
          </div>
          <motion.button
            type="submit"
            whileTap={{ scale: 0.92 }}
            disabled={!normalizeInterest(draft) || full}
            aria-label="Dodaj zainteresowanie"
            className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-[14px] bg-accent text-white transition-opacity disabled:opacity-30"
          >
            <PlusIcon width={22} height={22} strokeWidth={2.6} />
          </motion.button>
        </form>

        <section>
          <div className="mb-2 flex items-baseline justify-between px-1">
            <h3 className="text-[13px] text-label-2 uppercase">Twoje</h3>
            <span className="text-[13px] text-label-2 tabular-nums">
              {list.length}/{INTERESTS_MAX}
            </span>
          </div>
          {selected === null ? (
            <div className="flex justify-center py-4 text-label-2">
              <SpinnerIcon width={22} height={22} />
            </div>
          ) : list.length === 0 ? (
            <p className="px-1 text-[14px] text-label-2">Nic jeszcze nie wybrano. Dotknij propozycji poniżej.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              <AnimatePresence initial={false}>
                {list.map((t) => (
                  <motion.li key={t} layout initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}>
                    <button
                      onClick={() => remove(t)}
                      aria-label={`Usuń: ${t}`}
                      className="flex items-center gap-1.5 rounded-full bg-accent py-1.5 pr-2.5 pl-3.5 text-[15px] font-medium text-white active:opacity-70"
                    >
                      {t}
                      <XIcon width={14} height={14} strokeWidth={2.6} />
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </section>

        {suggestions.length > 0 && (
          <section>
            <h3 className="mb-2 px-1 text-[13px] text-label-2 uppercase">Propozycje</h3>
            <ul className="flex flex-wrap gap-2">
              {suggestions.map((t) => (
                <li key={t}>
                  <motion.button
                    whileTap={{ scale: 0.94 }}
                    onClick={() => add(t)}
                    disabled={full}
                    className="rounded-full bg-surface px-3.5 py-1.5 text-[15px] disabled:opacity-40"
                  >
                    {t}
                  </motion.button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
