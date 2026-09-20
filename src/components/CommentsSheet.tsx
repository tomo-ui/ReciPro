import type { Profile } from '@/types/recipe'
import { CommentsSection } from './CommentsSection'

interface Props {
  recipeId: string
  recipeTitle: string
  /** Autor przepisu może usuwać każdy komentarz pod nim */
  isRecipeOwner: boolean
  me: Profile
  /** Ustawia kursor w polu nowego komentarza od razu po otwarciu (dotknięcie ikony komentarza) */
  autoFocus: boolean
  onClose: () => void
  onOpenAuthor: (username: string) => void
}

/** Same komentarze pod przepisem (bez wchodzenia w przepis), w arkuszu wysuwanym od dołu */
export function CommentsSheet({ recipeId, recipeTitle, isRecipeOwner, me, autoFocus, onClose, onOpenAuthor }: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-11 shrink-0 items-center justify-between px-4">
        <span className="w-16" />
        <h2 className="min-w-0 truncate text-center text-[17px] font-semibold">Komentarze</h2>
        <button onClick={onClose} className="w-16 text-right text-[17px] font-semibold text-accent active:opacity-50">
          Gotowe
        </button>
      </header>
      <p className="truncate px-4 pb-2 text-center text-[13px] text-label-2">{recipeTitle}</p>
      <div className="scroll-y flex-1 px-4 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+24px)]">
        <CommentsSection
          recipeId={recipeId}
          me={me}
          isRecipeOwner={isRecipeOwner}
          autoFocus={autoFocus}
          onOpenAuthor={onOpenAuthor}
          onCountChange={() => {}}
        />
      </div>
    </div>
  )
}
