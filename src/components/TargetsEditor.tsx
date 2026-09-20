import { useEffect, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import type { DietTargets } from '@/types/diet'
import { withMacros } from '@/lib/diet'
import { PRESETS } from '@/lib/prefs'
import { MinusIcon, PlusIcon } from './Icons'
import { Toggle } from './formParts'

interface Props {
  value: DietTargets
  onChange: (next: DietTargets) => void
  /** Liczba posiłków w ciągu dnia (gdy ma być edytowana tutaj) */
  meals?: { count: number; onChange: (n: number) => void }
}

const PRESET_KEYS = Object.keys(PRESETS) as Exclude<DietTargets['preset'], 'custom'>[]

/**
 * Cele żywieniowe: kalorie dziennie, proporcje makro (gotowe zestawy albo własne białko i tłuszcz;
 * węglowodany to reszta) oraz dwa priorytety mikroskładników: mniej soli i więcej błonnika.
 */
export function TargetsEditor({ value, onChange, meals }: Props) {
  const grams = (pct: number, per: number) => Math.round((value.kcalPerDay * pct) / 100 / per)
  return (
    <div className="divide-y divide-separator overflow-hidden rounded-[14px] bg-surface">
      <Row label="Kalorie dziennie">
        <KcalField value={value.kcalPerDay} onChange={(kcalPerDay) => onChange({ ...value, kcalPerDay })} />
      </Row>

      {meals && (
        <Row label="Posiłków dziennie">
          <Step label="Mniej posiłków" onClick={() => meals.onChange(meals.count - 1)}>
            <MinusIcon width={16} height={16} />
          </Step>
          <span className="w-8 text-center font-semibold tabular-nums">{meals.count}</span>
          <Step label="Więcej posiłków" onClick={() => meals.onChange(meals.count + 1)}>
            <PlusIcon width={16} height={16} />
          </Step>
        </Row>
      )}

      <div className="px-4 py-3">
        <p className="mb-2 text-[16px]">Proporcje makroskładników</p>
        <div className="flex flex-wrap gap-2">
          {PRESET_KEYS.map((k) => (
            <Chip key={k} active={value.preset === k} onClick={() => onChange(withMacros(value, { preset: k }))}>
              {PRESETS[k].label}
            </Chip>
          ))}
          <Chip active={value.preset === 'custom'} onClick={() => onChange(withMacros(value, {}))}>
            Własne
          </Chip>
        </div>
        <p className="mt-2 text-[12px] text-label-2 tabular-nums">
          Białko {value.protein}% ({grams(value.protein, 4)} g) · tłuszcz {value.fat}% ({grams(value.fat, 9)} g) · węglowodany {value.carbs}% (
          {grams(value.carbs, 4)} g)
        </p>
      </div>

      {value.preset === 'custom' && (
        <>
          <Row label="Białko %">
            <Step label="Mniej białka" onClick={() => onChange(withMacros(value, { protein: value.protein - 1 }))}>
              <MinusIcon width={16} height={16} />
            </Step>
            <span className="w-10 text-center font-semibold tabular-nums">{value.protein}</span>
            <Step label="Więcej białka" onClick={() => onChange(withMacros(value, { protein: value.protein + 1 }))}>
              <PlusIcon width={16} height={16} />
            </Step>
          </Row>
          <Row label="Tłuszcz %">
            <Step label="Mniej tłuszczu" onClick={() => onChange(withMacros(value, { fat: value.fat - 1 }))}>
              <MinusIcon width={16} height={16} />
            </Step>
            <span className="w-10 text-center font-semibold tabular-nums">{value.fat}</span>
            <Step label="Więcej tłuszczu" onClick={() => onChange(withMacros(value, { fat: value.fat + 1 }))}>
              <PlusIcon width={16} height={16} />
            </Step>
          </Row>
          <Row label="Węglowodany %">
            <span className="text-label-2">reszta: {value.carbs}</span>
          </Row>
        </>
      )}

      <Row label="Mniej soli">
        <Toggle checked={value.lowSalt} onChange={(lowSalt) => onChange({ ...value, lowSalt })} label="Mniej soli" />
      </Row>
      <Row label="Więcej błonnika">
        <Toggle checked={value.highFiber} onChange={(highFiber) => onChange({ ...value, highFiber })} label="Więcej błonnika" />
      </Row>
    </div>
  )
}

/** Pole kalorii z własnym tekstem, żeby wpisywanie „2500” nie skakało do minimum po pierwszej cyfrze */
function KcalField({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  return (
    <>
      <input
        value={text}
        inputMode="numeric"
        aria-label="Kalorie dziennie"
        onChange={(e) => {
          const t = e.target.value.replace(/\D/g, '').slice(0, 4)
          setText(t)
          const n = parseInt(t, 10)
          if (n >= 800 && n <= 6000) onChange(n)
        }}
        onBlur={() => setText(String(value))}
        className="w-24 bg-transparent text-right outline-none"
      />
      <span className="ml-1 text-label-2">kcal</span>
    </>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-[16px]">
      <span>{label}</span>
      <span className="flex items-center gap-2">{children}</span>
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded-full px-3.5 py-1.5 text-[14px] ${active ? 'bg-accent text-white' : 'bg-surface-2'}`}>
      {children}
    </button>
  )
}

function Step({ children, label, onClick }: { children: ReactNode; label: string; onClick: () => void }) {
  return (
    <motion.button whileTap={{ scale: 0.88 }} onClick={onClick} aria-label={label} className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-white">
      {children}
    </motion.button>
  )
}
