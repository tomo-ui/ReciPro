import { useState } from 'react'
import { motion } from 'framer-motion'
import type { RecipeStats } from '@/types/recipe'
import { backend } from '@/lib/data'
import { HeartIcon } from './Icons'

interface Props {
  recipeId: string
  /** Bez statystyk (jeszcze się wczytują) przycisk jest nieaktywny */
  stats?: RecipeStats
  onChange: (next: RecipeStats) => void
  large?: boolean
}

/** Serce z licznikiem: zmienia się od razu, a przy błędzie wraca do poprzedniego stanu */
export function LikeButton({ recipeId, stats, onChange, large }: Props) {
  const [busy, setBusy] = useState(false)
  const liked = stats?.liked ?? false

  async function toggle(e: React.MouseEvent) {
    e.stopPropagation()
    if (!stats || busy) return
    setBusy(true)
    const before = stats
    const nextLiked = !before.liked
    onChange({ ...before, liked: nextLiked, like_count: Math.max(0, before.like_count + (nextLiked ? 1 : -1)) })
    try {
      await (nextLiked ? backend.likeRecipe(recipeId) : backend.unlikeRecipe(recipeId))
    } catch (err) {
      onChange(before)
      alert(err instanceof Error ? err.message : 'Nie udało się zmienić polubienia.')
    } finally {
      setBusy(false)
    }
  }

  const size = large ? 26 : 22
  return (
    <motion.button
      whileTap={{ scale: 0.85 }}
      onClick={toggle}
      disabled={!stats}
      aria-pressed={liked}
      aria-label={liked ? 'Cofnij polubienie' : 'Polub przepis'}
      className={`flex items-center gap-1.5 transition-colors disabled:opacity-40 ${liked ? 'text-red-500' : 'text-label-2'} ${
        large ? 'text-[16px] font-semibold' : 'text-[14px]'
      }`}
    >
      <motion.span key={String(liked)} initial={{ scale: liked ? 0.6 : 1 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 18 }}>
        <HeartIcon width={size} height={size} filled={liked} />
      </motion.span>
      <span className="tabular-nums">{stats?.like_count ?? '–'}</span>
    </motion.button>
  )
}
