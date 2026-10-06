import { useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { backend } from '@/lib/data'
import { onModerationRequest, type ModerationRequest } from '@/lib/moderationUi'
import { ActionSheet } from './ActionSheet'
import { ConfirmDialog } from './ConfirmDialog'
import { ReportSheet } from './ReportSheet'
import { Sheet } from './Sheet'

type Step = 'menu' | 'report' | 'block'

interface Props {
  /** Po zablokowaniu: odświeżenie feedu i zamknięcie ekranów tej osoby */
  onBlocked: (userId: string, username: string) => void
}

/**
 * Jedna warstwa obsługująca „Zgłoś” i „Zablokuj” z dowolnego miejsca (patrz lib/moderationUi.ts):
 * menu działań → okno zgłoszenia → potwierdzenie blokady. Leży ponad arkuszami, więc działa też z panelu komentarzy.
 */
export function ModerationLayer({ onBlocked }: Props) {
  const [request, setRequest] = useState<ModerationRequest | null>(null)
  const [step, setStep] = useState<Step | null>(null)
  const [blockError, setBlockError] = useState<string | null>(null)

  useEffect(
    () =>
      onModerationRequest((r) => {
        setRequest(r)
        setStep('menu')
        setBlockError(null)
      }),
    [],
  )

  const close = () => setStep(null)
  const noun = request?.target.type === 'recipe' ? 'przepis' : request?.target.type === 'comment' ? 'komentarz' : 'profil'

  async function block() {
    if (!request) return
    try {
      await backend.blockUser(request.userId)
      onBlocked(request.userId, request.username)
      close()
    } catch (e) {
      setBlockError(e instanceof Error ? e.message : 'Nie udało się zablokować użytkownika.')
    }
  }

  return (
    <>
      <AnimatePresence>
        {step === 'menu' && request && (
          <ActionSheet
            key="menu"
            title={request.label}
            onClose={close}
            actions={[
              { label: `Zgłoś ${noun}`, onClick: () => setStep('report'), danger: true },
              { label: `Zablokuj @${request.username}`, onClick: () => setStep('block'), danger: true },
            ]}
          />
        )}
        {step === 'report' && request && (
          <Sheet key="report" size="large" elevated onClose={close}>
            <ReportSheet request={request} onClose={close} onBlock={() => setStep('block')} />
          </Sheet>
        )}
      </AnimatePresence>
      {step === 'block' && request && (
        <ConfirmDialog
          title={`Zablokować @${request.username}?`}
          message={
            blockError ??
            'Nie zobaczycie nawzajem swoich profili, przepisów i komentarzy, a wzajemne obserwowanie zostanie zakończone. Możesz to cofnąć w Ustawieniach → Prywatność i bezpieczeństwo.'
          }
          confirmLabel="Zablokuj"
          onConfirm={() => void block()}
          onCancel={close}
        />
      )}
    </>
  )
}
