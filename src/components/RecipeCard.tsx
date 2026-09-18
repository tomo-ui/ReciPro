import { motion } from 'framer-motion'
import type { Recipe } from '@/types/recipe'
import { coverGradient, formatMinutes, springSoft, totalTime } from '@/lib/ui'
import { ClockIcon } from './Icons'

export function RecipeCard({ recipe, onOpen }: { recipe: Recipe; onOpen: () => void }) {
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
      <div
        className="relative aspect-[4/3] w-full"
        style={{
          background: recipe.image_url ? undefined : coverGradient(recipe.id + recipe.title),
        }}
      >
        {recipe.image_url ? (
          <img
            src={recipe.image_url}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-6xl font-bold text-white/40">
            {recipe.title.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <h3 className="line-clamp-2 text-[15px] leading-tight font-semibold">{recipe.title}</h3>
        {time && (
          <p className="mt-auto flex items-center gap-1 text-[13px] text-label-2">
            <ClockIcon width={13} height={13} />
            {time}
          </p>
        )}
      </div>
    </motion.button>
  )
}
