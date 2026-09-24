import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import type { Food } from '@/lib/foodDb'
import type { DietItem, MealTemplate } from '@/types/diet'
import { backend } from '@/lib/data'
import { itemsFromTemplate } from '@/lib/diet'
import { ConfirmDialog } from './ConfirmDialog'
import { PlusIcon, SpinnerIcon, TrashIcon } from './Icons'
import { FoodPicker } from './FoodPicker'
import { SegmentedControl } from './SegmentedControl'
import { Sheet } from './Sheet'

interface Props {
  onPickFood: (food: Food, grams: number) => void
  /** Wstawia dania z wybranego szablonu do aktualnego posiłku */
  onInsertTemplate: (items: DietItem[]) => void
  onClose: () => void
}

type Tab = 'produkt' | 'zapisane'

/**
 * Dodawanie składnika do posiłku: zakładka „Produkt” (baza składników, jak wcześniej) i „Zapisane posiłki”
 * (wcześniej zapisane zestawy dań do wstawienia jednym ruchem). Samo zapisywanie posiłku jako szablonu
 * jest osobną akcją — ikoną zakładki obok przycisku „Dodaj składnik” w diecie.
 */
export function AddDishSheet({ onPickFood, onInsertTemplate, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('produkt')

  return createPortal(
    <Sheet onClose={onClose}>
      <header className="flex h-11 shrink-0 items-center justify-between px-4">
        <span className="w-16" />
        <h2 className="text-[17px] font-semibold">Dodaj składnik</h2>
        <button onClick={onClose} className="w-16 text-right text-[17px] font-semibold text-accent active:opacity-50">
          Gotowe
        </button>
      </header>
      <div className="px-4 pb-2">
        <SegmentedControl<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'produkt', label: 'Produkt' },
            { value: 'zapisane', label: 'Zapisane posiłki' },
          ]}
        />
      </div>

      {tab === 'produkt' ? (
        <FoodPicker embedded askAmount onPick={(food, grams) => onPickFood(food, grams ?? 100)} onClose={onClose} />
      ) : (
        <SavedMealsPicker onInsert={onInsertTemplate} />
      )}
    </Sheet>,
    document.body,
  )
}

function SavedMealsPicker({ onInsert }: { onInsert: (items: DietItem[]) => void }) {
  const [templates, setTemplates] = useState<MealTemplate[] | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

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

  async function remove(id: string) {
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

  return (
    <div className="scroll-y flex-1 space-y-4 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+24px)]">
      {error && <p className="rounded-[12px] bg-surface px-4 py-3 text-[14px] text-red-500">{error}</p>}

      {templates === undefined ? (
        <div className="flex justify-center py-8 text-label-2">
          <SpinnerIcon width={22} height={22} />
        </div>
      ) : templates.length === 0 ? (
        <p className="rounded-[14px] bg-surface p-4 text-[14px] text-label-2">
          Nie masz jeszcze zapisanych posiłków. Zapisz posiłek ikoną zakładki obok „Dodaj składnik”.
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
              <button onClick={() => setConfirmingId(t.id)} disabled={deletingId === t.id} aria-label={`Usuń szablon ${t.name}`} className="flex h-8 w-8 shrink-0 items-center justify-center text-label-2 active:opacity-50">
                {deletingId === t.id ? <SpinnerIcon width={16} height={16} /> : <TrashIcon width={16} height={16} />}
              </button>
            </li>
          ))}
        </ul>
      )}

      {confirmingId && (
        <ConfirmDialog
          title="Usunąć ten zapisany posiłek?"
          onCancel={() => setConfirmingId(null)}
          onConfirm={() => {
            const id = confirmingId
            setConfirmingId(null)
            void remove(id)
          }}
        />
      )}
    </div>
  )
}
