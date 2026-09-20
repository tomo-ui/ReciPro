import { motion } from 'framer-motion'
import type { ProfileSummary } from '@/types/recipe'
import { Avatar } from './Avatar'
import { VerifiedBadge } from './VerifiedBadge'
import { FollowButton } from './FollowButton'
import { LockIcon } from './Icons'

interface Props {
  person: ProfileSummary
  onOpen: () => void
  onFollowChange: (following: boolean) => void
}

/** Wiersz osoby (wyszukiwarka, listy obserwujących): awatar, nazwa, imię i nazwisko, liczniki, „Obserwuj” */
export function PersonRow({ person, onOpen, onFollowChange }: Props) {
  return (
    <li>
      <motion.div whileTap={{ backgroundColor: 'var(--surface-2)' }} onClick={onOpen} className="flex cursor-pointer items-center gap-3 px-4 py-3">
        <Avatar name={person.username} src={person.avatar_url} size={46} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center text-[16px] font-semibold">
            <span className="truncate">{person.username}</span>
            <VerifiedBadge username={person.username} size={15} />
            {!person.is_public && <LockIcon width={13} height={13} className="ml-1.5 shrink-0 text-label-2" />}
          </p>
          {person.full_name && <p className="truncate text-[14px] text-label-2">{person.full_name}</p>}
          <p className="text-[12px] text-label-2">
            {person.is_public || person.is_me ? `${person.recipe_count} przepisów · ` : ''}
            {person.followers_count} obserwujących
          </p>
        </div>
        {!person.is_me && <FollowButton compact userId={person.id} following={person.is_following} onChange={onFollowChange} />}
      </motion.div>
    </li>
  )
}
