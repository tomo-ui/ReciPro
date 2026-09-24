import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import type { DietMeal } from '@/types/diet'
import { itemNutrients, sumNutrients } from '@/lib/diet'
import { IDX, formatAmount } from '@/lib/nutrients'
import { useFoodDb } from '@/hooks/useFoodDb'
import { SpinnerIcon } from './Icons'
import { Sheet } from './Sheet'

interface Props {
  meal: Pick<DietMeal, 'name' | 'items'>
  onSave: (name: string) => Promise<void>
  onClose: () => void
}

/** Zapis posiłku jako szablonu: nazwa do edycji i podgląd dań, zatwierdzane pomarańczowym przyciskiem „Zapisz” */
export function SaveMealSheet({ meal, onSave, onClose }: Props) {
  const db = useFoodDb()
  const [name, setName] = useState(meal.name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nutrientsPerItem = useMemo(() => (db ? meal.items.map((it) => itemNutrients(it, db)) : null), [db, meal.items])
  const totalKcal = useMemo(() => (nutrientsPerItem ? sumNutrients(nutrientsPerItem)[IDX.kcal] : null), [nutrientsPerItem])

  async function save() {
    if (busy || !name.trim()) return
    setBusy(true)
    setError(null)
    try {
      await onSave(name.trim())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się zapisać posiłku.')
      setBusy(false)
    }
  }

  return createPortal(
    <Sheet onClose={onClose}>
      <header className="flex h-11 shrink-0 items-center justify-between px-4">
        <button onClick={onClose} className="text-[17px] text-accent active:opacity-50">
          Anuluj
        </button>
        <h2 className="text-[17px] font-semibold">Zapisz posiłek</h2>
        <span className="w-14" />
      </header>

      <div className="scroll-y flex-1 space-y-5 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+24px)]">
        <div>
          <p className="mb-1.5 px-1 text-[13px] text-label-2 uppercase">Nazwa</p>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 60))}
            placeholder="Nazwa, np. Moje śniadanie"
            aria-label="Nazwa szablonu"
            className="w-full rounded-[12px] bg-surface-2 px-3.5 py-2.5 outline-none placeholder:text-label-3"
          />
        </div>

        <div>
          <p className="mb-1.5 px-1 text-[13px] text-label-2 uppercase">Produkty</p>
          <ul className="divide-y divide-separator overflow-hidden rounded-[14px] bg-surface">
            {meal.items.map((item, i) => (
              <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{item.title}</span>
                  <span className="block truncate text-[12px] text-label-2">{item.lines.map((l) => l.text).join(', ')}</span>
                </span>
                <span className="shrink-0 text-[13px] text-label-2 tabular-nums">{nutrientsPerItem ? `${formatAmount(nutrientsPerItem[i][IDX.kcal])} kcal` : '…'}</span>
              </li>
            ))}
          </ul>
          <div className="mt-1.5 flex items-center justify-between px-1 text-[13px] font-semibold text-label-2">
            <span>Razem</span>
            <span className="tabular-nums">{totalKcal !== null ? `${formatAmount(totalKcal)} kcal` : '…'}</span>
          </div>
        </div>

        {error && <p className="text-[13px] text-red-500">{error}</p>}

        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={save}
          disabled={busy || !name.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-accent py-3.5 text-[16px] font-semibold text-white disabled:opacity-60"
        >
          {busy && <SpinnerIcon width={18} height={18} />} Zapisz
        </motion.button>
      </div>
    </Sheet>,
    document.body,
  )
}
