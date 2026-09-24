import { useState } from 'react'
import type { Recipe, RecipeDraft } from '@/types/recipe'
import { DietTab } from '@/components/DietTab'
import { GoalsTab } from '@/components/GoalsTab'
import { SegmentedControl } from '@/components/SegmentedControl'

interface Props {
  username: string
  recipes: Recipe[]
  onSaveRecipe: (draft: RecipeDraft) => Promise<void>
  /** Otwiera dietę (nowa albo z listy) na stosie ekranów */
  onOpenDiet: (id: string) => void
  /** Zmiana wymusza odświeżenie listy diet po powrocie */
  dietVersion?: number
  onClose: () => void
}

type Tab = 'cele' | 'dieta'

/**
 * Licznik kalorii: dostępny wyłącznie z Ustawień, tylko dla konta twórcy aplikacji (patrz SettingsMenu i App.tsx).
 * „Cele” to cele dzienne (kalorie, makra), bez dopasowywania dania do celu — ta funkcja jest zablokowana.
 * „Dieta” to rozpisywanie diety na posiłki, na razie też widoczne tylko tutaj.
 */
export function CaloriesScreen({ username, recipes, onSaveRecipe, onOpenDiet, dietVersion, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('cele')
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-11 shrink-0 items-center justify-between px-4">
        <span className="w-16" />
        <h2 className="text-[17px] font-semibold">Licznik kalorii</h2>
        <button onClick={onClose} className="w-16 text-right text-[17px] font-semibold text-accent active:opacity-50">
          Gotowe
        </button>
      </header>
      <div className="scroll-y flex-1 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+24px)]">
        <SegmentedControl<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'cele', label: 'Cele' },
            { value: 'dieta', label: 'Dieta' },
          ]}
        />
        {tab === 'cele' ? (
          <GoalsTab recipes={recipes} onSaveRecipe={onSaveRecipe} hideAdapt />
        ) : (
          <DietTab username={username} isMe onOpenDiet={onOpenDiet} reloadKey={dietVersion} />
        )}
      </div>
    </div>
  )
}
