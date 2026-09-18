import type { ReactNode } from 'react'

/* Elementy formularzy w stylu „inset grouped” z iOS — wspólne dla przepisu, profilu i logowania */

export function Group({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-separator overflow-hidden rounded-[14px] bg-surface">{children}</div>
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center gap-4 px-4 py-3">
      <span className="shrink-0 text-[16px]">{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  )
}

export function NumberInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      inputMode="numeric"
      pattern="[0-9]*"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
      placeholder="—"
      className="w-full bg-transparent text-right outline-none placeholder:text-label-3"
    />
  )
}

export function TextBlock(props: {
  header: string
  footer?: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  rows?: number
}) {
  return (
    <div>
      <p className="mb-1.5 px-4 text-[13px] text-label-2 uppercase">{props.header}</p>
      <Group>
        <textarea
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          placeholder={props.placeholder}
          rows={props.rows ?? 4}
          className="block min-h-28 w-full resize-none bg-transparent px-4 py-3 outline-none [field-sizing:content] placeholder:text-label-3"
        />
      </Group>
      {props.footer && <p className="mt-1.5 px-4 text-[13px] text-label-2">{props.footer}</p>}
    </div>
  )
}

/** Przełącznik w stylu iOS */
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors ${checked ? 'bg-green-500' : 'bg-surface-2'}`}
    >
      <span
        className={`absolute top-[2px] left-[2px] h-[27px] w-[27px] rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : ''
        }`}
      />
    </button>
  )
}
