import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import type { Food, PortionKey } from '@/lib/foodDb'
import { FEATURES } from '@/lib/features'
import { IDX, formatAmount } from '@/lib/nutrients'
import { useDebounced } from '@/hooks/useDebounced'
import { useFoodDb } from '@/hooks/useFoodDb'
import { MinusIcon, PlusIcon, SearchIcon, SpinnerIcon } from './Icons'
import { Sheet } from './Sheet'

interface Props {
  title?: string
  /** true = po wyborze produktu pytamy o gramaturę (dodawanie składnika); false = tylko wybór produktu */
  askAmount?: boolean
  initialQuery?: string
  /** true = bez własnego Sheet/nagłówka — do osadzenia w cudzym arkuszu (np. jako zakładka). Rodzic daje „Anuluj”/„Gotowe”. */
  embedded?: boolean
  onPick: (food: Food, grams?: number) => void
  onClose: () => void
}

const QUICK = ['mąka', 'mleko', 'jajko', 'masło', 'kurczak', 'ziemniaki', 'ryż', 'makaron', 'pomidor', 'cebula', 'ser', 'cukier', 'oliwa', 'wołowina', 'łosoś']
const PRESET_GRAMS = [50, 100, 150, 200, 250]
const TOP = 8

/** Kolejność miar do pokazania (łyżka/łyżeczka/sztuka najpierw — to o nie pytają najczęściej), z polską nazwą */
const PORTION_KEYS: PortionKey[] = ['t', 's', 'pc', 'c', 'sl', 'cl', 'cn']
const PORTION_LABEL: Record<PortionKey, string> = { t: 'łyżka', s: 'łyżeczka', pc: 'sztuka', c: 'szklanka', sl: 'plasterek', cl: 'ząbek', cn: 'puszka' }

/** Krok zmiany gramatury: drobny dla małych ilości, większy dla dużych */
export const gramStep = (g: number) => (g < 50 ? 5 : g < 250 ? 10 : g < 1000 ? 25 : 100)
/** Krok zmiany liczby miar: łyżki, łyżeczki i szklanki wygodnie dzieli się na pół */
const countStep = (unit: PortionKey) => (unit === 't' || unit === 's' || unit === 'c' ? 0.5 : 1)

/** Wyszukiwarka składników z bazy (kilka tysięcy produktów, lokalnie) z wyborem gramatury */
export function FoodPicker({ title = 'Baza składników', askAmount, initialQuery = '', embedded, onPick, onClose }: Props) {
  const db = useFoodDb()
  const [query, setQuery] = useState(initialQuery)
  const debounced = useDebounced(query, 150)
  const [selected, setSelected] = useState<Food | null>(null)

  // Domyślnie bez produktów markowych, z restauracji i dla niemowląt; najpierw kilka najlepszych trafień
  const [brands, setBrands] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const results = useMemo(() => (db && debounced.trim() ? db.search(debounced, { limit: 60, hideJunk: !brands }) : []), [db, debounced, brands])
  const visible = expanded ? results : results.slice(0, TOP)

  function choose(food: Food) {
    if (askAmount) setSelected(food)
    else onPick(food)
  }

  const content = (
    <>
      {/* embedded: rodzic ma własny nagłówek — tu tylko „Wstecz” z gramatury do listy, gdy trzeba */}
      {embedded ? (
        selected && (
          <div className="flex h-9 shrink-0 items-center px-4">
            <button onClick={() => setSelected(null)} className="text-[15px] text-accent active:opacity-50">
              ‹ Wstecz
            </button>
          </div>
        )
      ) : (
        <header className="flex h-11 shrink-0 items-center justify-between px-4">
          <button onClick={selected ? () => setSelected(null) : onClose} className="text-[17px] text-accent active:opacity-50">
            {selected ? 'Wstecz' : 'Anuluj'}
          </button>
          <h2 className="text-[17px] font-semibold">{title}</h2>
          <span className="w-14" />
        </header>
      )}

      {selected ? (
        <AmountStep
          food={selected}
          onAdd={(grams) => {
            onPick(selected, grams)
            // Wraca do listy — rodzic (osadzenie) nie musi zamykać arkusza po każdym dodaniu
            setSelected(null)
            setQuery('')
          }}
        />
      ) : (
        <>
          <div className="px-4 pt-1 pb-3">
            <label className="flex items-center gap-2 rounded-[12px] bg-surface-2 px-3 py-2.5">
              <SearchIcon width={18} height={18} className="shrink-0 text-label-2" />
              <input
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setExpanded(false)
                }}
                placeholder="Szukaj składnika, np. mąka pszenna"
                aria-label="Szukaj składnika"
                autoCapitalize="none"
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-label-3"
              />
            </label>
          </div>

          <div className="scroll-y flex-1 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+24px)]">
            {!db ? (
              <div className="flex flex-col items-center gap-2 pt-16 text-label-2">
                <SpinnerIcon width={24} height={24} />
                <p className="text-[14px]">Wczytuję bazę składników…</p>
              </div>
            ) : !debounced.trim() ? (
              <div>
                <p className="mb-2 px-1 text-[13px] text-label-2 uppercase">Popularne</p>
                <div className="flex flex-wrap gap-2">
                  {QUICK.map((q) => (
                    <button key={q} onClick={() => setQuery(q)} className="rounded-full bg-surface px-3.5 py-2 text-[15px] active:opacity-60">
                      {q}
                    </button>
                  ))}
                </div>
                <p className="mt-5 px-1 text-[13px] text-label-2">
                  {db.size.toLocaleString('pl-PL')} produktów: ogólne składniki (USDA) i polskie produkty z opakowań (Open Food Facts, licencja ODbL). Nazwy możesz wpisywać po polsku, w dowolnej odmianie, także z marką.
                </p>
              </div>
            ) : results.length === 0 ? (
              <p className="pt-16 text-center text-[15px] text-label-2">Nic nie znaleziono. Spróbuj innego słowa.</p>
            ) : (
              <ul className="divide-y divide-separator overflow-hidden rounded-[14px] bg-surface">
                {visible.map((f) => (
                  <li key={f.id}>
                    <motion.button
                      whileTap={{ backgroundColor: 'var(--surface-2)' }}
                      onClick={() => choose(f)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 text-[15px] leading-snug">{f.name}</span>
                        <span className="block truncate text-[12px] text-label-2">{f.source === 'off' ? (f.brand ? `${f.brand} · z opakowania` : 'Produkt z opakowania') : f.cat}</span>
                      </span>
                      {FEATURES.nutrition && (
                        <span className="shrink-0 text-right text-[13px] text-label-2 tabular-nums">
                          <span className="block font-semibold text-label">{formatAmount(f.n[IDX.kcal])} kcal</span>
                          na 100 g
                        </span>
                      )}
                    </motion.button>
                  </li>
                ))}
              </ul>
            )}
            {debounced.trim() && db && (
              <div className="mt-3 space-y-2 text-center">
                {!expanded && results.length > TOP && (
                  <button onClick={() => setExpanded(true)} className="w-full rounded-[12px] bg-surface py-3 text-[15px] font-medium text-accent">
                    Pokaż więcej ({results.length - TOP})
                  </button>
                )}
                <button onClick={() => setBrands((b) => !b)} className="text-[13px] text-label-2 underline">
                  {brands ? 'Ukryj produkty markowe, z restauracji i dla niemowląt' : 'Pokaż też produkty markowe, z restauracji i dla niemowląt'}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </>
  )

  if (embedded) return content
  return createPortal(<Sheet onClose={onClose}>{content}</Sheet>, document.body)
}

/**
 * Gramatura wybranego produktu: wprost w gramach albo miarą (łyżka, łyżeczka, sztuka, szklanka, plasterek,
 * ząbek, puszka), gdy baza zna wagę jednej takiej miary — wtedy liczbę miar przeliczamy na gramy automatycznie.
 */
function AmountStep({ food, onAdd }: { food: Food; onAdd: (grams: number) => void }) {
  const units = useMemo(() => PORTION_KEYS.filter((k) => food.p[k]), [food])
  const [mode, setMode] = useState<'g' | PortionKey>('g')
  const [grams, setGrams] = useState(100)
  const [count, setCount] = useState(1)

  const unitGrams = mode === 'g' ? 0 : (food.p[mode] ?? 0)
  const total = mode === 'g' ? grams : Math.round(count * unitGrams * 10) / 10
  const k = total / 100
  const kcal = food.n[IDX.kcal] * k
  const gStep = gramStep(grams)
  const cStep = mode === 'g' ? 1 : countStep(mode)

  function step(dir: 1 | -1) {
    if (mode === 'g') setGrams((g) => Math.min(5000, Math.max(0, g + dir * gStep)))
    else setCount((c) => Math.max(0, Math.round((c + dir * cStep) * 100) / 100))
  }

  return (
    <div className="scroll-y flex-1 space-y-5 px-4 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+24px)]">
      <div>
        <p className="text-[19px] leading-snug font-semibold">{food.name}</p>
        <p className="mt-0.5 text-[13px] text-label-2">{food.source === 'off' ? (food.brand ? `${food.brand} · produkt z opakowania` : 'Produkt z opakowania') : food.cat}</p>
      </div>

      <div className="rounded-[16px] bg-surface p-4">
        <p className="text-center text-[13px] text-label-2 uppercase">{mode === 'g' ? 'Gramatura' : 'Ilość'}</p>

        {units.length > 0 && (
          <div className="mt-2 mb-3 flex flex-wrap justify-center gap-1.5">
            <UnitChip active={mode === 'g'} onClick={() => setMode('g')}>
              gramy
            </UnitChip>
            {units.map((u) => (
              <UnitChip key={u} active={mode === u} onClick={() => setMode(u)}>
                {PORTION_LABEL[u]}
              </UnitChip>
            ))}
          </div>
        )}

        <div className="flex items-center justify-center gap-4">
          <Step label="Mniej" onClick={() => step(-1)}>
            <MinusIcon width={20} height={20} />
          </Step>
          {mode === 'g' ? (
            <label className="flex items-baseline gap-1">
              <input
                value={grams}
                inputMode="numeric"
                aria-label="Gramatura w gramach"
                onChange={(e) => setGrams(Math.min(5000, Math.max(0, parseInt(e.target.value.replace(/\D/g, ''), 10) || 0)))}
                className="w-24 bg-transparent text-center text-[38px] font-bold tabular-nums outline-none"
              />
              <span className="text-[17px] text-label-2">g</span>
            </label>
          ) : (
            <label className="flex flex-col items-center">
              <span className="flex items-baseline gap-1.5">
                <input
                  value={count}
                  inputMode="decimal"
                  aria-label={`Liczba: ${PORTION_LABEL[mode]}`}
                  onChange={(e) => {
                    const v = e.target.value.replace(',', '.').replace(/[^0-9.]/g, '')
                    setCount(Math.min(100, Math.max(0, Number(v) || 0)))
                  }}
                  className="w-16 bg-transparent text-center text-[38px] font-bold tabular-nums outline-none"
                />
                <span className="text-[17px] text-label-2">× {PORTION_LABEL[mode]}</span>
              </span>
              <span className="mt-0.5 text-[13px] text-label-2 tabular-nums">≈ {formatAmount(total)} g</span>
            </label>
          )}
          <Step label="Więcej" onClick={() => step(1)}>
            <PlusIcon width={20} height={20} />
          </Step>
        </div>

        {mode === 'g' && (
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {PRESET_GRAMS.map((g) => (
              <button
                key={g}
                onClick={() => setGrams(g)}
                className={`rounded-full px-3.5 py-1.5 text-[14px] ${g === grams ? 'bg-accent text-white' : 'bg-surface-2'}`}
              >
                {g} g
              </button>
            ))}
          </div>
        )}
      </div>

      {FEATURES.nutrition && (
        <div className="grid grid-cols-4 gap-2 text-center">
          <Macro label="kcal" value={kcal} />
          <Macro label="białko" value={food.n[IDX.protein] * k} unit="g" />
          <Macro label="tłuszcz" value={food.n[IDX.fat] * k} unit="g" />
          <Macro label="węgle" value={food.n[IDX.carbs] * k} unit="g" />
        </div>
      )}

      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={() => onAdd(total)}
        disabled={total <= 0}
        className="w-full rounded-[14px] bg-accent py-3.5 text-[17px] font-semibold text-white disabled:opacity-40"
      >
        Dodaj do przepisu
      </motion.button>
    </div>
  )
}

function Step({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <motion.button
      whileTap={{ scale: 0.88 }}
      onClick={onClick}
      aria-label={label}
      className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-white"
    >
      {children}
    </motion.button>
  )
}

function UnitChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded-full px-3 py-1 text-[13px] ${active ? 'bg-accent text-white' : 'bg-surface-2 text-label-2'}`}>
      {children}
    </button>
  )
}

function Macro({ label, value, unit }: { label: string; value: number; unit?: string }) {
  return (
    <div className="rounded-[12px] bg-surface py-2.5">
      <p className="text-[17px] font-bold tabular-nums">
        {formatAmount(value)}
        {unit && <span className="ml-0.5 text-[12px] font-medium text-label-2">{unit}</span>}
      </p>
      <p className="text-[12px] text-label-2">{label}</p>
    </div>
  )
}
