import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Recipe, RecipeDraft } from '@/types/recipe'
import { IDX, MICROS, NUTRIENTS, formatAmount, formatNutrient, macroShares, saltGrams, type NutrientKey } from '@/lib/nutrients'
import { kcalPerServing, lineName, type LineAnalysis } from '@/lib/nutrition'
import { useRecipeNutrition } from '@/hooks/useFoodDb'
import { ChevronDownIcon, FlameIcon, SlidersIcon, SpinnerIcon } from './Icons'
import { AdaptSheet } from './AdaptSheet'

interface Props {
  recipe: Recipe
  /** Zapisuje dopasowaną wersję jako nowy przepis użytkownika */
  onSaveCopy?: (draft: RecipeDraft) => Promise<void>
}

const MACRO_COLORS = { protein: '#4c8dff', fat: '#f5a524', carbs: '#34c759' }

/** Wartości odżywcze przepisu: kalorie, makro, witaminy i minerały oraz dopasowanie do celów użytkownika */
export function NutritionSection({ recipe, onSaveCopy }: Props) {
  const r = useRecipeNutrition(recipe.ingredients, recipe.servings)
  const [showMicros, setShowMicros] = useState(false)
  const [showLines, setShowLines] = useState(false)
  const [adapting, setAdapting] = useState(false)

  if (!r) {
    return (
      <div className="flex items-center gap-2 rounded-[16px] bg-surface p-4 text-[14px] text-label-2">
        <SpinnerIcon width={18} height={18} /> Liczę wartości odżywcze…
      </div>
    )
  }

  const kcal = kcalPerServing(r)
  if (kcal === null) {
    return (
      <p className="rounded-[16px] bg-surface p-4 text-[14px] text-label-2">
        Za mało danych, żeby oszacować kalorie: składniki nie mają ilości albo nie ma ich w bazie. Dodaj ilości (np. „200 g mąki”) w edycji przepisu.
      </p>
    )
  }

  const n = r.perServing ?? r.total
  const shares = macroShares(n)
  const per = r.servings ? `na porcję · przepis na ${r.servings}` : 'w całym przepisie'
  const sodium = n[IDX.sodium]

  return (
    <div className="space-y-3">
      <div className="rounded-[16px] bg-surface p-4">
        <div className="flex items-baseline gap-2">
          <FlameIcon width={22} height={22} className="self-center text-accent" />
          <span className="text-[36px] leading-none font-bold tabular-nums">≈ {kcal}</span>
          <span className="text-[16px] text-label-2">kcal</span>
        </div>
        <p className="mt-1 text-[13px] text-label-2">{per}</p>
        {!r.servings && <p className="mt-0.5 text-[12px] text-label-2">Podaj liczbę porcji w edycji, żeby zobaczyć wartości na porcję.</p>}

        <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-surface-2" role="img" aria-label="Udział białka, tłuszczu i węglowodanów w kaloriach">
          <span style={{ width: `${shares.protein}%`, background: MACRO_COLORS.protein }} />
          <span style={{ width: `${shares.fat}%`, background: MACRO_COLORS.fat }} />
          <span style={{ width: `${shares.carbs}%`, background: MACRO_COLORS.carbs }} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Macro label="Białko" grams={n[IDX.protein]} share={shares.protein} color={MACRO_COLORS.protein} />
          <Macro label="Tłuszcz" grams={n[IDX.fat]} share={shares.fat} color={MACRO_COLORS.fat} />
          <Macro label="Węglowodany" grams={n[IDX.carbs]} share={shares.carbs} color={MACRO_COLORS.carbs} />
        </div>
      </div>

      <ul className="divide-y divide-separator overflow-hidden rounded-[16px] bg-surface text-[15px]">
        <Row label="w tym cukry" value={formatNutrient('sugars', n[IDX.sugars])} />
        <Row label="w tym tłuszcze nasycone" value={formatNutrient('satfat', n[IDX.satfat])} />
        <Row label="Błonnik" value={formatNutrient('fiber', n[IDX.fiber])} />
        <Row label="Sól" value={`${formatAmount(saltGrams(sodium))} g`} hint={`${Math.round((sodium / 2000) * 100)}% dziennego limitu`} />
        <Row label="Cholesterol" value={formatNutrient('cholesterol', n[IDX.cholesterol])} />
      </ul>

      <Collapsible title="Witaminy i minerały" open={showMicros} onToggle={() => setShowMicros((o) => !o)}>
        <ul className="divide-y divide-separator">
          {MICROS.map((key) => (
            <Micro key={key} nutrient={key} value={n[IDX[key]]} />
          ))}
        </ul>
        <p className="px-4 py-2.5 text-[12px] text-label-2">Procent dziennego zapotrzebowania dorosłego (RWS, UE) pokrywany przez jedną porcję.</p>
      </Collapsible>

      <Collapsible title="Z czego to policzono" open={showLines} onToggle={() => setShowLines((o) => !o)}>
        <ul className="divide-y divide-separator">
          {r.lines.map((l, i) => (
            <LineRow key={`${i}-${l.text}`} line={l} />
          ))}
        </ul>
        <p className="px-4 py-2.5 text-[12px] text-label-2">
          Uwzględniono {r.counted} z {r.withAmount} składników z ilością. To szacunek z bazy składników USDA (produkty surowe, bez strat przy obróbce); zły
          produkt możesz zmienić w edycji przepisu.
        </p>
      </Collapsible>

      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={() => setAdapting(true)}
        className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-accent py-3.5 text-[16px] font-semibold text-white"
      >
        <SlidersIcon width={18} height={18} /> Dostosuj do moich celów
      </motion.button>

      <AnimatePresence>{adapting && <AdaptSheet recipe={recipe} onClose={() => setAdapting(false)} onSaveCopy={onSaveCopy} />}</AnimatePresence>
    </div>
  )
}

function Macro({ label, grams, share, color }: { label: string; grams: number; share: number; color: string }) {
  return (
    <div>
      <p className="text-[19px] font-bold tabular-nums">
        {formatAmount(grams)}
        <span className="ml-0.5 text-[12px] font-medium text-label-2">g</span>
      </p>
      <p className="flex items-center justify-center gap-1 text-[12px] text-label-2">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        {label} · {Math.round(share)}%
      </p>
    </div>
  )
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <li className="flex items-baseline justify-between gap-3 px-4 py-2.5">
      <span>{label}</span>
      <span className="text-right">
        <span className="font-semibold tabular-nums">{value}</span>
        {hint && <span className="block text-[12px] text-label-2">{hint}</span>}
      </span>
    </li>
  )
}

function Micro({ nutrient, value }: { nutrient: NutrientKey; value: number }) {
  const info = NUTRIENTS[IDX[nutrient]]
  const pct = info.daily ? (value / info.daily) * 100 : 0
  return (
    <li className="px-4 py-2.5">
      <div className="flex items-baseline justify-between text-[15px]">
        <span>{info.label}</span>
        <span className="tabular-nums">
          <span className="font-semibold">{formatNutrient(nutrient, value)}</span>
          <span className="ml-2 text-[13px] text-label-2">{Math.round(pct)}%</span>
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </li>
  )
}

function LineRow({ line }: { line: LineAnalysis }) {
  const note =
    line.status === 'no-amount'
      ? 'bez ilości — pominięto'
      : line.status === 'no-match'
        ? 'brak w bazie — pominięto'
        : line.status === 'no-weight'
          ? 'nie znam wagi tej miary — pominięto'
          : null
  return (
    <li className="px-4 py-2.5 text-[14px]">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 flex-1 truncate">{lineName(line)}</span>
        {line.nutrients ? (
          <span className="shrink-0 tabular-nums text-label-2">
            {formatAmount(line.grams ?? 0)} g · <span className="font-semibold text-label">{formatAmount(line.nutrients[IDX.kcal])} kcal</span>
          </span>
        ) : (
          <span className="shrink-0 text-[12px] text-label-2">{note}</span>
        )}
      </div>
      {line.food && <p className="truncate text-[12px] text-label-2">→ {line.food.name}</p>}
    </li>
  )
}

function Collapsible({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[16px] bg-surface">
      <button onClick={onToggle} aria-expanded={open} className="flex w-full items-center justify-between px-4 py-3.5 text-left text-[16px] font-medium">
        {title}
        <ChevronDownIcon width={18} height={18} className={`text-label-2 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-separator">
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
