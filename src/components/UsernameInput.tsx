import { USERNAME_MAX } from '@/lib/username'
import type { UsernameStatus } from '@/hooks/useUsernameCheck'

interface Props {
  value: string
  onChange: (v: string) => void
  status: UsernameStatus
  autoFocus?: boolean
}

/** Pole nazwy użytkownika z „@” i komunikatem o poprawności/dostępności pod spodem */
export function UsernameInput({ value, onChange, status, autoFocus }: Props) {
  return (
    <div>
      <div className="flex items-center gap-1 px-4 py-3.5">
        <span className="text-label-2">@</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value.toLowerCase().replace(/\s/g, ''))}
          placeholder="nazwa_uzytkownika"
          maxLength={USERNAME_MAX + 5}
          autoFocus={autoFocus}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-describedby="username-status"
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-label-3"
        />
      </div>
      <p id="username-status" className={`px-4 pb-2.5 text-[13px] ${colorFor(status)}`} aria-live="polite">
        {messageFor(status)}
      </p>
    </div>
  )
}

function messageFor(s: UsernameStatus): string {
  switch (s.state) {
    case 'empty':
      return 'Litery a–z, cyfry, kropka i podkreślnik (do 30 znaków).'
    case 'invalid':
    case 'error':
      return s.message
    case 'checking':
      return 'Sprawdzam dostępność…'
    case 'taken':
      return 'Ta nazwa użytkownika jest już zajęta.'
    case 'ok':
      return 'Nazwa jest dostępna.'
  }
}

function colorFor(s: UsernameStatus): string {
  if (s.state === 'invalid' || s.state === 'taken' || s.state === 'error') return 'text-red-500'
  if (s.state === 'ok') return 'text-green-600'
  return 'text-label-2'
}
