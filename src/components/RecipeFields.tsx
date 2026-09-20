import { useRef, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import type { FormState } from '@/lib/recipeForm'
import { CameraIcon, SpinnerIcon, TrashIcon } from './Icons'
import { Field, Group, NumberInput, TextBlock } from './formParts'
import { IngredientTools } from './IngredientTools'

interface Props {
  form: FormState
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void
  imageSrc?: string
  imageBusy: boolean
  imageError: string | null
  onPickImage: (file: File) => void
  onRemoveImage: () => void
  /** Miejsce na komunikaty nad polami (np. „odczytano z opisu filmu”) */
  notes?: ReactNode
}

/** Pola formularza przepisu — wspólne dla dodawania („Ręcznie”) i edycji */
export function RecipeFields({ form, set, imageSrc, imageBusy, imageError, onPickImage, onRemoveImage, notes }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <div className="space-y-5">
      {notes}

      <div>
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[16px] bg-surface-2">
          {imageSrc ? (
            <img
              src={imageSrc}
              alt="Zdjęcie przepisu"
              className="h-full w-full object-cover"
              draggable={false}
              onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
            />
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex h-full w-full flex-col items-center justify-center gap-2 text-label-2"
            >
              <CameraIcon width={30} height={30} />
              <span className="text-[15px]">Dodaj zdjęcie</span>
            </button>
          )}
          {imageBusy && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-white">
              <SpinnerIcon width={28} height={28} />
            </div>
          )}
        </div>

        {imageSrc && (
          <div className="mt-2 flex gap-3 px-1">
            <motion.button
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 rounded-full bg-surface px-3.5 py-2 text-[14px] font-medium text-accent"
            >
              <CameraIcon width={16} height={16} /> Zmień zdjęcie
            </motion.button>
            <motion.button
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={onRemoveImage}
              className="flex items-center gap-1.5 rounded-full bg-surface px-3.5 py-2 text-[14px] font-medium text-red-500"
            >
              <TrashIcon width={16} height={16} /> Usuń
            </motion.button>
          </div>
        )}
        {imageError && <p className="mt-2 px-1 text-[13px] text-red-500">{imageError}</p>}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = '' // pozwala wybrać ten sam plik ponownie
            if (file) onPickImage(file)
          }}
        />
      </div>

      <Group>
        <Field label="Tytuł">
          <input
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="Np. Zupa pomidorowa"
            className="w-full bg-transparent text-right outline-none placeholder:text-label-3"
          />
        </Field>
        <Field label="Porcje">
          <NumberInput value={form.servings} onChange={(v) => set('servings', v)} />
        </Field>
        <Field label="Przygotowanie (min)">
          <NumberInput value={form.prep} onChange={(v) => set('prep', v)} />
        </Field>
        <Field label="Gotowanie (min)">
          <NumberInput value={form.cook} onChange={(v) => set('cook', v)} />
        </Field>
      </Group>

      <TextBlock
        header="Opis"
        value={form.description}
        onChange={(v) => set('description', v)}
        placeholder="Krótko o przepisie (opcjonalnie)"
        rows={2}
      />
      <TextBlock
        header="Składniki"
        footer="Jeden składnik w linii, z ilością na początku (np. „200 g mąki”) — dzięki temu kalkulator porcji przeliczy proporcje. Sekcja: linia zaczynająca się od #, np. „# Ciasto”."
        value={form.ingredients}
        onChange={(v) => set('ingredients', v)}
        placeholder={'200 g mąki\n2 jajka'}
      />
      <IngredientTools form={form} set={set} />
      <TextBlock
        header="Przygotowanie"
        footer="Jeden krok w linii. Sekcje jak wyżej."
        value={form.steps}
        onChange={(v) => set('steps', v)}
        placeholder={'Wymieszaj składniki.\nPiecz 30 minut.'}
      />

      <div>
        <Group>
          <Field label="Tagi">
            <input
              value={form.tags}
              onChange={(e) => set('tags', e.target.value)}
              placeholder="deser, szybkie"
              autoCapitalize="none"
              className="w-full bg-transparent text-right outline-none placeholder:text-label-3"
            />
          </Field>
        </Group>
        <p className="mt-1.5 px-4 text-[13px] text-label-2">Po przecinku. Po tagach inni znajdą Twój przepis w wyszukiwarce.</p>
      </div>
    </div>
  )
}
