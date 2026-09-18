import { useState } from 'react'
import type { Recipe, RecipeDraft } from '@/types/recipe'
import { draftToForm } from '@/lib/recipeForm'
import { useRecipeForm } from '@/hooks/useRecipeForm'
import { RecipeFields } from '@/components/RecipeFields'

interface Props {
  recipe: Recipe
  onClose: () => void
  onSave: (id: string, draft: RecipeDraft) => Promise<Recipe>
}

/** Edycja własnego przepisu: wszystkie pola i zdjęcie (zmiana albo usunięcie) */
export function EditRecipeScreen({ recipe, onClose, onSave }: Props) {
  const rf = useRecipeForm(draftToForm(recipe))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSave = rf.form.title.trim().length > 0 && !saving && !rf.imageBusy

  async function save() {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      const { draft, commit, rollback } = await rf.prepare()
      try {
        await onSave(recipe.id, draft)
      } catch (e) {
        await rollback()
        throw e
      }
      await commit() // usuwa stare zdjęcie, jeśli zostało zastąpione albo usunięte
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się zapisać zmian.')
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-11 shrink-0 items-center justify-between px-4">
        <button onClick={onClose} className="text-[17px] text-accent active:opacity-50">
          Anuluj
        </button>
        <h2 className="text-[17px] font-semibold">Edytuj przepis</h2>
        <button
          onClick={save}
          disabled={!canSave}
          className="text-[17px] font-semibold text-accent transition-opacity active:opacity-50 disabled:opacity-35"
        >
          Zapisz
        </button>
      </header>

      <div className="scroll-y flex-1 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+32px)]">
        {error && <p className="mb-3 rounded-[12px] bg-surface px-4 py-3 text-[14px] text-red-500">{error}</p>}
        <RecipeFields
          form={rf.form}
          set={rf.set}
          imageSrc={rf.imageSrc}
          imageBusy={rf.imageBusy}
          imageError={rf.imageError}
          onPickImage={rf.pickImage}
          onRemoveImage={rf.removeImage}
        />
      </div>
    </div>
  )
}
