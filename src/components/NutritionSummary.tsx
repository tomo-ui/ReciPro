import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { IDX, NUTRIENTS, formatAmount, saltGrams, type Nutrients } from '@/lib/nutrients'
import type { MealTarget } from '@/lib/prefs'
import { ChevronDownIcon } from './Icons'

const COLORS = { protein: '#4c8dff', fat: '#f5a524', carbs: '#34c759' }

/** Jeden pasek postępu: ile jest względem celu (przekroczenie zaznaczone kolorem) */
export function Bar({ value, goal, color, limit }: { value: number; goal: number; color: string; limit?: boolean }) {
  const pct = goal > 0 ? (value / goal) * 100 : 0
  const over = pct > 110
  return (
    <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${Math.round(pct)}% celu`}>
      <div
        className="h-full rounded-full transition-[width]"
        style={{ width: `${Math.min(100, pct)}%`, background: over || (limit && pct > 100) ? '#ff453a' : color }}
      />
    </div>
  )
}

/** Krótka linia: kalorie i makro (B/T/W) */
export function MacroLine({ n, className = '' }: { n: Nutrients; className?: string }) {
  return (
    <span className={`tabular-nums ${className}`}>
      {formatAmount(n[IDX.kcal])} kcal · B {formatAmount(n[IDX.protein])} · T {formatAmount(n[IDX.fat])} · W {formatAmount(n[IDX.carbs])} g
    </span>
  )
}

interface Props {
  /** Wartości do pokazania (dzień albo posiłek) */
  n: Nutrients
  target: MealTarget
  /** Nagłówek, np. „Dzień” */
  title?: string
  /** Pokaż tabelę wszystkich składników (dla dietetyków) */
  details?: boolean
}

/**
 * Podsumowanie: kalorie względem celu, trzy makroskładniki z paskami i udziałem w kaloriach,
 * a po rozwinięciu pełna tabela (cukry, błonnik, sól, witaminy i minerały z % dziennego zapotrzebowania).
 */
export function NutritionSummary({ n, target, title, details = true }: Props) {
  const [open, setOpen] = useState(false)
  const kcal = n[IDX.kcal]
  const p = n[IDX.protein] * 4
  const f = n[IDX.fat] * 9
  const c = n[IDX.carbs] * 4
  const sum = p + f + c || 1
  const diff = kcal - target.kcal
  const state = target.kcal <= 0 ? '' : Math.abs(diff) <= target.kcal * 0.05 ? 'w celu' : diff > 0 ? `+${formatAmount(diff)} kcal` : `brakuje ${formatAmount(-diff)} kcal`
  const stateColor = Math.abs(diff) <= target.kcal * 0.05 ? 'text-green-600' : diff > 0 ? 'text-red-500' : 'text-amber-500'

  return (
    <div className="overflow-hidden rounded-[16px] bg-surface">
      <div className="p-4">
        {title && <p className="mb-1 text-[13px] text-label-2 uppercase">{title}</p>}
        <div className="flex items-baseline justify-between gap-2">
          <p>
            <span className="text-[34px] leading-none font-bold tabular-nums">{formatAmount(kcal)}</span>
            <span className="ml-1.5 text-[15px] text-label-2 tabular-nums">/ {formatAmount(target.kcal)} kcal</span>
          </p>
          <span className={`text-[13px] font-semibold ${stateColor}`}>{state}</span>
        </div>
        <div className="mt-2.5">
          <Bar value={kcal} goal={target.kcal} color="var(--accent)" />
        </div>

        <div className="mt-4 space-y-2.5">
          <MacroRow label="Białko" grams={n[IDX.protein]} goal={target.protein} share={(p / sum) * 100} color={COLORS.protein} />
          <MacroRow label="Tłuszcz" grams={n[IDX.fat]} goal={target.fat} share={(f / sum) * 100} color={COLORS.fat} />
          <MacroRow label="Węglowodany" grams={n[IDX.carbs]} goal={target.carbs} share={(c / sum) * 100} color={COLORS.carbs} />
        </div>
      </div>

      {details && (
        <>
          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="flex w-full items-center justify-between border-t border-separator px-4 py-3 text-left text-[15px] font-medium text-accent"
          >
            Wszystkie wartości odżywcze
            <ChevronDownIcon width={18} height={18} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
          <AnimatePresence initial={false}>
            {open && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <NutrientTable n={n} />
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  )
}

function MacroRow({ label, grams, goal, share, color }: { label: string; grams: number; goal: number; share: number; color: string }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-[14px]">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: color }} />
          {label}
          <span className="text-[12px] text-label-2">· {Math.round(share)}% kcal</span>
        </span>
        <span className="tabular-nums">
          <span className="font-semibold">{formatAmount(grams)}</span>
          <span className="text-label-2"> / {formatAmount(goal)} g</span>
        </span>
      </div>
      <Bar value={grams} goal={goal} color={color} />
    </div>
  )
}

/** Tabela wszystkich składników odżywczych z procentem dziennej dawki (RWS) albo limitu */
export function NutrientTable({ n }: { n: Nutrients }) {
  const salt = saltGrams(n[IDX.sodium])
  return (
    <div className="border-t border-separator">
      <table className="w-full text-[14px]">
        <thead>
          <tr className="text-left text-[12px] text-label-2">
            <th className="px-4 py-2 font-medium">Składnik</th>
            <th className="px-2 py-2 text-right font-medium">Ilość</th>
            <th className="px-4 py-2 text-right font-medium">% RWS</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-separator">
          {NUTRIENTS.filter((x) => x.key !== 'kcal').map((x) => {
            const v = n[IDX[x.key]]
            const pct = x.daily ? (v / x.daily) * 100 : undefined
            const bad = x.limit && pct !== undefined && pct > 100
            return (
              <tr key={x.key}>
                <td className="px-4 py-2">
                  {x.label}
                  {x.limit && <span className="ml-1 text-[11px] text-label-2">limit</span>}
                  {x.key === 'sodium' && <span className="block text-[11px] text-label-2">sól: {formatAmount(salt)} g</span>}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {formatAmount(v)} {x.unit}
                </td>
                <td className={`px-4 py-2 text-right tabular-nums ${bad ? 'font-semibold text-red-500' : 'text-label-2'}`}>
                  {pct === undefined ? '–' : `${Math.round(pct)}%`}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="px-4 py-2.5 text-[12px] text-label-2">
        RWS = referencyjna wartość spożycia dla dorosłych (UE). Wartości szacunkowe z bazy składników (produkty surowe, bez strat przy obróbce).
      </p>
    </div>
  )
}
