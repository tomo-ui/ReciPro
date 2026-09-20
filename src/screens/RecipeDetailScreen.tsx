import { useState } from 'react'
import { motion, useDragControls } from 'framer-motion'
import type { Profile, Recipe, RecipeDraft } from '@/types/recipe'
import { normalizeIngredient } from '@/lib/ingredients'
import { scaleFactor, scaleIngredient } from '@/lib/scale'
import { formatMinutes, spring, totalTime } from '@/lib/ui'
import { useRecipeStats } from '@/hooks/useRecipeStats'
import { Avatar } from '@/components/Avatar'
import { VerifiedBadge } from '@/components/VerifiedBadge'
import { ChevronLeftIcon, ClockIcon, CommentIcon, MinusIcon, PencilIcon, PlusIcon, TrashIcon, UsersIcon } from '@/components/Icons'
import { CommentsSection } from '@/components/CommentsSection'
import { LikeButton } from '@/components/LikeButton'
import { NutritionSection } from '@/components/NutritionSection'
import { FEATURES } from '@/lib/features'
import { Cover } from '@/components/RecipeCard'

interface Props {
  recipe: Recipe
  /** Zalogowany użytkownik (autor nowych komentarzy) */
  me: Profile
  /** Autor może edytować i usuwać; pozostali tylko oglądają */
  isOwner: boolean
  onBack: () => void
  onEdit: () => void
  onDelete: () => void
  onOpenAuthor: (username: string) => void
  /** Zapisuje dopasowaną wersję przepisu jako nowy przepis użytkownika */
  onSaveCopy?: (draft: RecipeDraft) => Promise<void>
}

/** Grupuje linie po polu `group`, zachowując kolejność */
function groupLines<T extends { group?: string }>(lines: T[]) {
  const groups: { name?: string; items: T[] }[] = []
  for (const line of lines) {
    const last = groups[groups.length - 1]
    if (last && last.name === line.group) last.items.push(line)
    else groups.push({ name: line.group, items: [line] })
  }
  return groups
}

const MAX_SERVINGS = 99

export function RecipeDetailScreen({ recipe, me, isOwner, onBack, onEdit, onDelete, onOpenAuthor, onSaveCopy }: Props) {
  const controls = useDragControls()
  const { stats, set: setStats, update: updateStats } = useRecipeStats([recipe])
  const recipeStats = stats[recipe.id]
  const time = formatMinutes(totalTime(recipe))

  // Kalkulator porcji: zmiana widoku, nie zapisuje się w przepisie (zapis = edycja)
  const original = recipe.servings
  const [target, setTarget] = useState(original ?? 0)
  const factor = scaleFactor(original, target) ?? 1
  const scaledView = original !== undefined && target !== original

  return (
    <motion.div
      className="fixed inset-0 z-30 bg-bg shadow-[-8px_0_24px_rgba(0,0,0,0.15)]"
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={spring}
      // Swipe od lewej krawędzi = „wstecz”, jak w UINavigationController
      drag="x"
      dragControls={controls}
      dragListener={false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={{ left: 0, right: 1 }}
      onDragEnd={(_, info) => {
        if (info.offset.x > 100 || info.velocity.x > 500) onBack()
      }}
    >
      <div className="absolute inset-y-0 left-0 z-40 w-5 touch-pan-y" onPointerDown={(e) => controls.start(e)} />

      <div className="scroll-y h-full">
        <Cover recipe={recipe} className="aspect-[4/3] max-h-80 w-full" />

        <div className="relative -mt-6 rounded-t-[28px] bg-bg px-[max(20px,env(safe-area-inset-left))] pt-6 pb-[calc(env(safe-area-inset-bottom,0px)+40px)]">
          <h1 className="text-[28px] leading-tight font-bold tracking-tight" data-selectable>
            {recipe.title}
          </h1>

          {!isOwner && recipe.author && (
            <button onClick={() => onOpenAuthor(recipe.author!.username)} className="mt-3 flex items-center gap-2.5 text-left">
              <Avatar name={recipe.author.username} src={recipe.author.avatar_url} size={30} />
              <span>
                <span className="flex items-center text-[15px] leading-tight font-semibold">
                  {recipe.author.username}
                  <VerifiedBadge username={recipe.author.username} size={14} />
                </span>
                {recipe.author.full_name && <span className="block text-[12px] text-label-2">{recipe.author.full_name}</span>}
              </span>
            </button>
          )}

          {recipe.description && (
            <p className="mt-3 text-[16px] text-label-2" data-selectable>
              {recipe.description}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2 text-[14px]">
            {time && (
              <Chip>
                <ClockIcon width={15} height={15} /> {time}
              </Chip>
            )}
            {original && (
              <Chip>
                <UsersIcon width={15} height={15} /> {original} porcji
              </Chip>
            )}
            {recipe.tags.map((t) => (
              <Chip key={t} muted>
                #{t}
              </Chip>
            ))}
          </div>

          <div className="mt-5 flex items-center gap-6 border-y border-separator py-3">
            <LikeButton large recipeId={recipe.id} stats={recipeStats} onChange={(next) => setStats(recipe.id, next)} />
            <button
              onClick={() => document.getElementById('komentarze')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              aria-label="Przejdź do komentarzy"
              className="flex items-center gap-1.5 text-[16px] font-semibold text-label-2"
            >
              <CommentIcon width={26} height={26} />
              <span className="tabular-nums">{recipeStats?.comment_count ?? '–'}</span>
            </button>
          </div>

          <Section title="Składniki">
            {original !== undefined && (
              <div className="mb-3 rounded-[14px] bg-surface p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[15px] font-semibold">Porcje</p>
                    <p className="text-[12px] text-label-2">Kalkulator przelicza ilości składników</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StepButton label="Mniej porcji" disabled={target <= 1} onClick={() => setTarget((t) => Math.max(1, t - 1))}>
                      <MinusIcon width={18} height={18} />
                    </StepButton>
                    <span className="min-w-8 text-center text-[22px] font-bold tabular-nums" aria-live="polite">
                      {target}
                    </span>
                    <StepButton label="Więcej porcji" disabled={target >= MAX_SERVINGS} onClick={() => setTarget((t) => Math.min(MAX_SERVINGS, t + 1))}>
                      <PlusIcon width={18} height={18} />
                    </StepButton>
                  </div>
                </div>
                {scaledView && (
                  <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-separator pt-2.5 text-[13px]">
                    <span className="text-label-2">
                      Przeliczono z {original} porcji. Ilości w krokach zostają bez zmian.
                    </span>
                    <button onClick={() => setTarget(original)} className="shrink-0 font-semibold text-accent">
                      Przywróć
                    </button>
                  </div>
                )}
              </div>
            )}

            {groupLines(recipe.ingredients).map((g, gi) => (
              <div key={gi} className="mb-3 last:mb-0">
                {g.name && <p className="mb-1 text-[13px] font-semibold text-label-2 uppercase">{g.name}</p>}
                <ul className="divide-y divide-separator overflow-hidden rounded-[14px] bg-surface">
                  {g.items.map((i, k) => {
                    const text = normalizeIngredient(i.text) // starsze przepisy też pokazujemy w jednym formacie
                    const line = scaledView ? scaleIngredient(text, factor) : { text, scaled: false }
                    return (
                      <li key={k} className={`px-4 py-3 text-[16px] ${line.scaled ? 'text-accent' : ''}`} data-selectable>
                        {line.text}
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </Section>

          {FEATURES.nutrition && (
            <Section title="Wartości odżywcze">
              <NutritionSection recipe={recipe} onSaveCopy={onSaveCopy} />
            </Section>
          )}

          <Section title="Przygotowanie">
            {recipe.steps.length === 0 && <p className="text-[15px] text-label-2">Brak opisanych kroków.</p>}
            {groupLines(recipe.steps).map((g, gi) => (
              <div key={gi} className="mb-3 last:mb-0">
                {g.name && <p className="mb-1 text-[13px] font-semibold text-label-2 uppercase">{g.name}</p>}
                <ol className="space-y-3">
                  {g.items.map((s, k) => (
                    <li key={k} className="flex gap-3">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-[13px] font-bold text-white">
                        {k + 1}
                      </span>
                      <p className="text-[16px] leading-relaxed" data-selectable>
                        {s.text}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </Section>

          <Section title={recipeStats ? `Komentarze (${recipeStats.comment_count})` : 'Komentarze'}>
            <div id="komentarze">
              <CommentsSection
                recipeId={recipe.id}
                me={me}
                isRecipeOwner={isOwner}
                onOpenAuthor={onOpenAuthor}
                onCountChange={(delta) => updateStats(recipe.id, (st) => ({ ...st, comment_count: Math.max(0, st.comment_count + delta) }))}
              />
            </div>
          </Section>

          {recipe.source_url && (
            <a
              href={recipe.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 block truncate text-[14px] text-accent"
            >
              Źródło: {safeHostname(recipe.source_url)}
            </a>
          )}

          {isOwner && (
            <button
              onClick={() => {
                if (confirm('Usunąć ten przepis? Zdjęcie też zostanie usunięte.')) onDelete()
              }}
              className="mt-8 flex w-full items-center justify-center gap-2 rounded-[14px] bg-surface py-3.5 text-[16px] font-medium text-red-500 active:opacity-60"
            >
              <TrashIcon width={18} height={18} /> Usuń przepis
            </button>
          )}
        </div>
      </div>

      {/* Pływające przyciski: wstecz i (dla autora) edycja */}
      <div className="absolute inset-x-0 top-0 z-20 pt-safe-top">
        <div className="flex h-11 items-center justify-between px-[max(12px,env(safe-area-inset-left))]">
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={onBack}
            aria-label="Wróć"
            className="glass flex h-9 w-9 items-center justify-center rounded-full text-label shadow-sm"
          >
            <ChevronLeftIcon />
          </motion.button>
          {isOwner && (
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={onEdit}
              aria-label="Edytuj przepis"
              className="glass flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold text-label shadow-sm"
            >
              <PencilIcon width={16} height={16} /> Edytuj
            </motion.button>
          )}
        </div>
      </div>
    </motion.div>
  )
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function StepButton({ children, label, disabled, onClick }: { children: React.ReactNode; label: string; disabled: boolean; onClick: () => void }) {
  return (
    <motion.button
      whileTap={{ scale: 0.88 }}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-white transition-opacity disabled:opacity-30"
    >
      {children}
    </motion.button>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="mb-3 text-[22px] font-bold tracking-tight">{title}</h2>
      {children}
    </section>
  )
}

function Chip({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 ${muted ? 'bg-surface-2 text-label-2' : 'bg-surface font-medium'}`}>
      {children}
    </span>
  )
}
