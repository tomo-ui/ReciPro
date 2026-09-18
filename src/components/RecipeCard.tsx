import { motion } from 'framer-motion'
import type { Recipe } from '@/types/recipe'
import { coverGradient, formatMinutes, springSoft, totalTime } from '@/lib/ui'
import { ClockIcon } from './Icons'

interface Props {
  recipe: Recipe
  onOpen: () => void
  /** Pokazuje @autora pod tytułem (cudze przepisy w wyszukiwarce) */
  showAuthor?: boolean
}

export function RecipeCard({ recipe, onOpen, showAuthor }: Props) {
  const time = formatMinutes(totalTime(recipe))

  return (
    <motion.button
      layout
      transition={springSoft}
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      whileTap={{ scale: 0.96 }}
      onClick={onOpen}
      className="flex flex-col overflow-hidden rounded-[20px] bg-surface text-left shadow-sm"
    >
      <Cover recipe={recipe} className="aspect-[4/3] w-full" />
      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="line-clamp-2 text-[15px] leading-tight font-semibold">{recipe.title}</h3>
        {showAuthor && recipe.author && <p className="truncate text-[13px] text-label-2">@{recipe.author.username}</p>}
        {time && (
          <p className="mt-auto flex items-center gap-1 pt-0.5 text-[13px] text-label-2">
            <ClockIcon width={13} height={13} />
            {time}
          </p>
        )}
      </div>
    </motion.button>
  )
}

/** Okładka: zdjęcie albo gradient z inicjałem. Zepsuty adres obrazka wraca do gradientu. */
export function Cover({ recipe, className = '' }: { recipe: Recipe; className?: string }) {
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ background: coverGradient(recipe.id + recipe.title) }}
    >
      <span className="absolute inset-0 flex items-center justify-center text-6xl font-bold text-white/40">
        {recipe.title.charAt(0).toUpperCase()}
      </span>
      {recipe.image_url && (
        <img
          src={recipe.image_url}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
          onError={(e) => (e.currentTarget.style.display = 'none')}
        />
      )}
    </div>
  )
}
