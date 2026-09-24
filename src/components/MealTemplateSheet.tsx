import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import type { DietItem, DietMeal, MealTemplate } from '@/types/diet'
import { backend } from '@/lib/data'
import { itemsFromTemplate, templateFromMeal } from '@/lib/diet'
import { BookmarkIcon, PlusIcon, SpinnerIcon, TrashIcon } from './Icons'
import { Sheet } from './Sheet'

interface Props {
  /** Posiłek, z którego można zapisać dania jako nowy szablon */
  currentMeal: Pick<DietMeal, 'name' | 'items'>
  /** Wstawia dania z wybranego szablonu do aktualnego posiłku */
  onInsert: (items: DietItem[]) => void
  onClose: () => void
}

/**
 * Zapisane posiłki (np. stałe śniadanie): lista do szybkiego wstawienia dań do dowolnej diety w przyszłości,
 * plus możliwość zapisania aktualnego posiłku jako nowego szablonu.
 */
export function MealTemplateSheet({ currentMeal, onInsert, onClose }: Props) {
  const [templates, setTemplates] = useState<MealTemplate[] | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState(currentMeal.name)
  const [busy, setBusy] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    backend
      .listMealTemplates()
      .then((t) => alive && setTemplates(t))
      .catch((e: unknown) => {
        if (!alive) return
        setTemplates([])
        setError(e instanceof Error ? e.message : 'Nie udało się wczytać zapisanych posiłków.')
      })
    return () => {
      alive = false
    }
  }, [])

  async function save() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const saved = await backend.saveMealTemplate(templateFromMeal({ ...currentMeal, name }))
      setTemplates((list) => [saved, ...(list ?? [])])
      setSaving(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się zapisać posiłku.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    if (!confirm('Usunąć ten zapisany posiłek?')) return
    setDeletingId(id)
    try {
      await backend.deleteMealTemplate(id)
      setTemplates((list) => list?.filter((t) => t.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się usunąć posiłku.')
    } finally {
      setDeletingId(null)
    }
  }

  return createPortal(
    <Sheet onClose={onClose}>
      <header className="flex h-11 shrink-0 items-center justify-between px-4">
        <button onClick={onClose} className="text-[17px] text-accent active:opacity-50">
          Zamknij
        </button>
        <h2 className="text-[17px] font-semibold">Zapisane posiłki</h2>
        <span className="w-16" />
      </header>

      <div className="scroll-y flex-1 space-y-4 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+24px)]">
        {error && <p className="rounded-[12px] bg-surface px-4 py-3 text-[14px] text-red-500">{error}</p>}

        {currentMeal.items.length > 0 && (
          <div className="overflow-hidden rounded-[14px] bg-surface">
            {!saving ? (
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  setName(currentMeal.name)
                  setSaving(true)
                }}
                className="flex w-full items-center justify-center gap-2 py-3.5 text-[16px] font-semibold text-accent"
              >
                <BookmarkIcon width={18} height={18} /> Zapisz ten posiłek jako szablon
              </motion.button>
            ) : (
              <div className="space-y-3 p-4">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 60))}
                  placeholder="Nazwa, np. Moje śniadanie"
                  aria-label="Nazwa szablonu"
                  className="w-full rounded-[12px] bg-surface-2 px-3.5 py-2.5 outline-none placeholder:text-label-3"
                />
                <p className="text-[12px] text-label-2">
                  {currentMeal.items.length} {currentMeal.items.length === 1 ? 'danie' : 'dań'}: {currentMeal.items.map((i) => i.title).join(', ')}
                </p>
                <div className="flex gap-2">
                  <button onClick={() => setSaving(false)} className="flex-1 rounded-[12px] bg-surface-2 py-2.5 text-[15px] font-medium">
                    Anuluj
                  </button>
                  <button onClick={save} disabled={busy || !name.trim()} className="flex flex-1 items-center justify-center gap-2 rounded-[12px] bg-accent py-2.5 text-[15px] font-semibold text-white disabled:opacity-60">
                    {busy && <SpinnerIcon width={16} height={16} />} Zapisz
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <section>
          <p className="mb-1.5 px-1 text-[13px] text-label-2 uppercase">Do wstawienia</p>
          {templates === undefined ? (
            <div className="flex justify-center py-8 text-label-2">
              <SpinnerIcon width={22} height={22} />
            </div>
          ) : templates.length === 0 ? (
            <p className="rounded-[14px] bg-surface p-4 text-[14px] text-label-2">
              Nie masz jeszcze zapisanych posiłków. Ułóż dania w posiłku, a potem zapisz go tutaj jako szablon.
            </p>
          ) : (
            <ul className="divide-y divide-separator overflow-hidden rounded-[14px] bg-surface">
              {templates.map((t) => (
                <li key={t.id} className="flex items-center gap-2 px-4 py-3">
                  <motion.button
                    whileTap={{ backgroundColor: 'var(--surface-2)' }}
                    onClick={() => onInsert(itemsFromTemplate(t))}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-accent">
                      <PlusIcon width={16} height={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium">{t.name}</span>
                      <span className="block truncate text-[12px] text-label-2">{t.items.map((i) => i.title).join(', ')}</span>
                    </span>
                  </motion.button>
                  <button onClick={() => remove(t.id)} disabled={deletingId === t.id} aria-label={`Usuń szablon ${t.name}`} className="flex h-8 w-8 shrink-0 items-center justify-center text-label-2 active:opacity-50">
                    {deletingId === t.id ? <SpinnerIcon width={16} height={16} /> : <TrashIcon width={16} height={16} />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Sheet>,
    document.body,
  )
}
