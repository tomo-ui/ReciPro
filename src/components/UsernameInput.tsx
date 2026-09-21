import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { USERNAME_MAX } from '@/lib/username'
import { InfoIcon } from './Icons'
import type { UsernameStatus } from '@/hooks/useUsernameCheck'

interface Props {
  value: string
  onChange: (v: string) => void
  status: UsernameStatus
  autoFocus?: boolean
}

/**
 * Pole nazwy użytkownika z „@”. Zasady wpisywania kryją się pod ikoną (i) po prawej; pod polem pojawia się
 * tylko komunikat o poprawności i dostępności nazwy (gdy coś wpisano).
 */
export function UsernameInput({ value, onChange, status, autoFocus }: Props) {
  const [help, setHelp] = useState(false)
  const message = messageFor(status)
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
          // To nie login: bez „username” iOS nie podpowiada zapamiętanych haseł ani nie wymusza ich wpisania po zaznaczeniu pola
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          data-form-type="other"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-describedby="username-status"
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-label-3"
        />
        <button
          type="button"
          onClick={() => setHelp((v) => !v)}
          aria-label="Zasady nazwy użytkownika"
          aria-expanded={help}
          className={`-mr-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors active:opacity-50 ${help ? 'text-accent' : 'text-label-2'}`}
        >
          <InfoIcon width={20} height={20} />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {(message || help) && (
          <motion.div
            key="username-extra"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            className="overflow-hidden"
          >
            <div className="space-y-1 px-4 pb-2.5 text-[13px]">
              {message && (
                <p id="username-status" className={colorFor(status)} aria-live="polite">
                  {message}
                </p>
              )}
              {help && (
                <p className="text-label-2">
                  Litery a–z (bez polskich znaków), cyfry, kropka i podkreślnik, do {USERNAME_MAX} znaków. Kropka nie może być na początku, na
                  końcu ani dwa razy z rzędu. Wielkość liter nie ma znaczenia.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function messageFor(s: UsernameStatus): string | null {
  switch (s.state) {
    case 'empty':
      return null
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
