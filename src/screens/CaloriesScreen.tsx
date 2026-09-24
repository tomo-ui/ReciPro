import type { Recipe, RecipeDraft } from '@/types/recipe'
import { GoalsTab } from '@/components/GoalsTab'

interface Props {
  recipes: Recipe[]
  onSaveRecipe: (draft: RecipeDraft) => Promise<void>
  onClose: () => void
}

/**
 * Licznik kalorii: dostępny wyłącznie z Ustawień, tylko dla konta twórcy aplikacji (patrz SettingsMenu i App.tsx).
 * Treść to gotowa zakładka „Cele” (GoalsTab) — cele dzienne, makra i dopasowanie dania do celu jednego posiłku.
 */
export function CaloriesScreen({ recipes, onSaveRecipe, onClose }: Props) {
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
        <GoalsTab recipes={recipes} onSaveRecipe={onSaveRecipe} />
      </div>
    </div>
  )
}
