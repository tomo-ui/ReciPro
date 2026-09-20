import { useMemo } from 'react'
import type { Recipe, RecipeDraft } from '@/types/recipe'
import { mealTargetOf, targetsFromPrefs } from '@/lib/diet'
import { sanitize } from '@/lib/prefs'
import { usePrefs } from '@/hooks/usePrefs'
import { AdaptSheet } from './AdaptSheet'
import { TargetsEditor } from './TargetsEditor'

interface Props {
  recipe: Recipe
  onClose: () => void
  /** Zapisuje dopasowaną wersję jako nowy przepis użytkownika */
  onSaveCopy?: (draft: RecipeDraft) => Promise<void>
}

/** Dopasowanie przepisu do moich celów (cele zapisane na tym urządzeniu) i zapis jako nowy przepis */
export function RecipeAdaptSheet({ recipe, onClose, onSaveCopy }: Props) {
  const { prefs, update } = usePrefs()
  const targets = useMemo(() => targetsFromPrefs(prefs), [prefs])
  const target = useMemo(() => mealTargetOf(targets, 100 / prefs.mealsPerDay), [targets, prefs.mealsPerDay])

  return (
    <AdaptSheet
      ingredients={recipe.ingredients}
      servings={recipe.servings}
      target={target}
      lowSalt={prefs.lowSalt}
      highFiber={prefs.highFiber}
      applyLabel="Zapisz jako nowy przepis"
      appliedLabel="Zapisano w Twoich przepisach"
      footnote="Oryginał zostaje bez zmian. Kopia nie dostaje zdjęcia z oryginału."
      onClose={onClose}
      onApply={async (ingredients) => {
        if (!onSaveCopy) return
        await onSaveCopy({
          title: `${recipe.title} (dopasowany)`,
          description: recipe.description,
          // zdjęcie zostaje przy oryginale: usunięcie któregoś z przepisów kasuje plik ze Storage
          image_url: undefined,
          source_url: recipe.source_url,
          servings: recipe.servings,
          prep_minutes: recipe.prep_minutes,
          cook_minutes: recipe.cook_minutes,
          total_minutes: recipe.total_minutes,
          ingredients,
          steps: recipe.steps,
          tags: recipe.tags,
          parse_method: 'manual',
        })
      }}
      header={
        <section>
          <p className="mb-1.5 px-1 text-[13px] text-label-2 uppercase">Moje cele</p>
          <TargetsEditor
            value={targets}
            onChange={(t) => update(sanitize({ ...prefs, ...t }))}
            meals={{ count: prefs.mealsPerDay, onChange: (mealsPerDay) => update({ mealsPerDay }) }}
          />
          <p className="mt-1.5 px-1 text-[12px] text-label-2">Ustawienia zostają na tym urządzeniu.</p>
        </section>
      }
    />
  )
}

