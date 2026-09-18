import { motion, useDragControls } from 'framer-motion'
import type { Recipe } from '@/types/recipe'
import { coverGradient, formatMinutes, spring, totalTime } from '@/lib/ui'
import { ChevronLeftIcon, ClockIcon, UsersIcon } from '@/components/Icons'

interface Props {
  recipe: Recipe
  onBack: () => void
  onDelete: () => void
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

export function RecipeDetailScreen({ recipe, onBack, onDelete }: Props) {
  const controls = useDragControls()
  const time = formatMinutes(totalTime(recipe))

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
      <div
        className="absolute inset-y-0 left-0 z-40 w-5 touch-pan-y"
        onPointerDown={(e) => controls.start(e)}
      />

      <div className="scroll-y h-full">
        <div
          className="relative h-64 w-full"
          style={{
            background: recipe.image_url ? undefined : coverGradient(recipe.id + recipe.title),
          }}
        >
          {recipe.image_url && (
            <img src={recipe.image_url} alt="" className="h-full w-full object-cover" draggable={false} />
          )}
        </div>

        <div className="relative -mt-6 rounded-t-[28px] bg-bg px-[max(20px,env(safe-area-inset-left))] pt-6 pb-[calc(env(safe-area-inset-bottom,0px)+40px)]">
          <h1 className="text-[28px] leading-tight font-bold tracking-tight" data-selectable>
            {recipe.title}
          </h1>
          {recipe.description && (
            <p className="mt-2 text-[16px] text-label-2" data-selectable>
              {recipe.description}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2 text-[14px]">
            {time && (
              <Chip>
                <ClockIcon width={15} height={15} /> {time}
              </Chip>
            )}
            {recipe.servings && (
              <Chip>
                <UsersIcon width={15} height={15} /> {recipe.servings} porcji
              </Chip>
            )}
            {recipe.tags.map((t) => (
              <Chip key={t} muted>
                #{t}
              </Chip>
            ))}
          </div>

          <Section title="Składniki">
            {groupLines(recipe.ingredients).map((g, gi) => (
              <div key={gi} className="mb-3 last:mb-0">
                {g.name && <p className="mb-1 text-[13px] font-semibold text-label-2 uppercase">{g.name}</p>}
                <ul className="divide-y divide-separator overflow-hidden rounded-[14px] bg-surface">
                  {g.items.map((i, k) => (
                    <li key={k} className="px-4 py-3 text-[16px]" data-selectable>
                      {i.text}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </Section>

          <Section title="Przygotowanie">
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

          {recipe.source_url && (
            <a
              href={recipe.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 block truncate text-[14px] text-accent"
            >
              Źródło: {new URL(recipe.source_url).hostname}
            </a>
          )}

          <button
            onClick={() => {
              if (confirm('Usunąć ten przepis?')) onDelete()
            }}
            className="mt-8 w-full rounded-[14px] bg-surface py-3.5 text-[16px] font-medium text-red-500 active:opacity-60"
          >
            Usuń przepis
          </button>
        </div>
      </div>

      {/* Pływający przycisk wstecz na okładce */}
      <div className="absolute inset-x-0 top-0 z-20 pt-safe-top">
        <div className="flex h-11 items-center pl-[max(12px,env(safe-area-inset-left))]">
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={onBack}
            aria-label="Wróć"
            className="glass flex h-9 w-9 items-center justify-center rounded-full text-label shadow-sm"
          >
            <ChevronLeftIcon />
          </motion.button>
        </div>
      </div>
    </motion.div>
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
    <span
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 ${
        muted ? 'bg-surface-2 text-label-2' : 'bg-surface font-medium'
      }`}
    >
      {children}
    </span>
  )
}
