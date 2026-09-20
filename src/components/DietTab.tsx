import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import type { Diet } from '@/types/diet'
import { backend } from '@/lib/data'
import { MAX_MEALS, newDiet } from '@/lib/diet'
import { loadPrefs } from '@/lib/prefs'
import { PlusIcon, SpinnerIcon } from './Icons'

interface Props {
  username: string
  isMe: boolean
  onOpenDiet: (id: string) => void
  /** Zmiana wymusza ponowne pobranie listy (po zmianach w diecie) */
  reloadKey?: number
}

const MEAL_CHOICES = [3, 4, 5, 6]

/**
 * Zakładka „Dieta” na profilu: moje diety (z możliwością rozpisania nowej na wybraną liczbę posiłków)
 * albo diety udostępnione przez inną osobę.
 */
export function DietTab({ username, isMe, onOpenDiet, reloadKey }: Props) {
  const [diets, setDiets] = useState<Diet[] | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [meals, setMeals] = useState(4)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    setError(null)
    backend
      .listDiets(username)
      .then((d) => alive && setDiets(d))
      .catch((e: unknown) => {
        if (!alive) return
        setDiets([])
        setError(e instanceof Error ? e.message : 'Nie udało się wczytać diet.')
      })
    return () => {
      alive = false
    }
  }, [username, reloadKey])

  async function create() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const saved = await backend.saveDiet(newDiet(title || 'Moja dieta', meals, loadPrefs()))
      setCreating(false)
      setTitle('')
      onOpenDiet(saved.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się utworzyć diety.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 pt-4">
      {error && <p className="rounded-[12px] bg-surface px-4 py-3 text-[14px] text-red-500">{error}</p>}

      {isMe && (
        <div className="overflow-hidden rounded-[16px] bg-surface">
          {!creating ? (
            <motion.button whileTap={{ scale: 0.98 }} onClick={() => setCreating(true)} className="flex w-full items-center justify-center gap-2 py-3.5 text-[16px] font-semibold text-accent">
              <PlusIcon width={18} height={18} /> Nowa dieta
            </motion.button>
          ) : (
            <div className="space-y-3 p-4">
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, 120))}
                placeholder="Nazwa diety, np. Redukcja 1800 kcal"
                aria-label="Nazwa diety"
                className="w-full rounded-[12px] bg-surface-2 px-3.5 py-2.5 outline-none placeholder:text-label-3"
              />
              <div>
                <p className="mb-1.5 text-[13px] text-label-2">Na ile posiłków rozpisać dzień?</p>
                <div className="flex flex-wrap gap-2">
                  {MEAL_CHOICES.map((n) => (
                    <button key={n} onClick={() => setMeals(n)} className={`min-w-11 rounded-full px-3.5 py-1.5 text-[15px] font-medium ${meals === n ? 'bg-accent text-white' : 'bg-surface-2'}`}>
                      {n}
                    </button>
                  ))}
                  {Array.from({ length: MAX_MEALS - 6 }, (_, i) => i + 7).map((n) => (
                    <button key={n} onClick={() => setMeals(n)} className={`min-w-11 rounded-full px-3.5 py-1.5 text-[15px] font-medium ${meals === n ? 'bg-accent text-white' : 'bg-surface-2'}`}>
                      {n}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[12px] text-label-2">Liczbę posiłków i podział kalorii zmienisz potem w diecie. Cele (kalorie, makro) bierzemy z zakładki Cele.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setCreating(false)} className="flex-1 rounded-[12px] bg-surface-2 py-2.5 text-[15px] font-medium">
                  Anuluj
                </button>
                <button onClick={create} disabled={busy} className="flex flex-1 items-center justify-center gap-2 rounded-[12px] bg-accent py-2.5 text-[15px] font-semibold text-white disabled:opacity-60">
                  {busy && <SpinnerIcon width={16} height={16} />} Utwórz
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {diets === undefined ? (
        <div className="flex justify-center py-8 text-label-2">
          <SpinnerIcon width={22} height={22} />
        </div>
      ) : diets.length === 0 ? (
        <p className="pt-6 text-center text-[15px] text-label-2">{isMe ? 'Nie masz jeszcze żadnej diety.' : 'Ta osoba nie udostępniła żadnej diety.'}</p>
      ) : (
        <ul className="space-y-2.5">
          {diets.map((d) => {
            const dishes = d.meals.reduce((a, m) => a + m.items.length, 0)
            return (
              <li key={d.id}>
                <motion.button whileTap={{ scale: 0.985 }} onClick={() => onOpenDiet(d.id)} className="block w-full rounded-[16px] bg-surface p-4 text-left">
                  <span className="flex items-start justify-between gap-2">
                    <span className="text-[17px] leading-snug font-semibold">{d.title}</span>
                    {isMe && d.is_public && <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-label-2">udostępniona</span>}
                  </span>
                  <span className="mt-1 block text-[13px] text-label-2 tabular-nums">
                    {d.targets.kcalPerDay} kcal · {d.meals.length} {d.meals.length === 1 ? 'posiłek' : d.meals.length < 5 ? 'posiłki' : 'posiłków'} · {dishes} {dishes === 1 ? 'danie' : 'dań'}
                  </span>
                  {d.source && <span className="mt-0.5 block text-[12px] text-label-2">Na podstawie diety @{d.source.username}</span>}
                  {d.description && <span className="mt-1 line-clamp-2 block text-[13px] text-label-2">{d.description}</span>}
                </motion.button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
