import { useId } from 'react'
import { motion } from 'framer-motion'
import { springSoft } from '@/lib/ui'

interface Props<T extends string> {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}

export function SegmentedControl<T extends string>({ value, options, onChange }: Props<T>) {
  const id = useId()
  return (
    <div className="relative flex rounded-[9px] bg-surface-2 p-[2px]" role="tablist">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className="relative z-10 flex-1 rounded-[7px] py-1.5 text-[14px] font-medium"
          >
            {active && (
              <motion.span
                layoutId={id}
                transition={springSoft}
                className="absolute inset-0 -z-10 rounded-[7px] bg-white shadow-sm dark:bg-[#636366]"
              />
            )}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
