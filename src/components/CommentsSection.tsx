import { useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Comment, Profile } from '@/types/recipe'
import { backend } from '@/lib/data'
import { timeAgo } from '@/lib/ui'
import { usePaged } from '@/hooks/usePaged'
import { Avatar } from './Avatar'
import { SendIcon, SpinnerIcon, TrashIcon } from './Icons'
import { LoadMore } from './LoadMore'

const MAX = 500

interface Props {
  recipeId: string
  me: Profile
  /** Autor przepisu może usuwać każdy komentarz pod nim */
  isRecipeOwner: boolean
  onOpenAuthor: (username: string) => void
  /** Zmiana liczby komentarzy (+1 / −1), żeby rodzic zaktualizował licznik */
  onCountChange: (delta: number) => void
}

export function CommentsSection({ recipeId, me, isRecipeOwner, onOpenAuthor, onCountChange }: Props) {
  const list = usePaged((o, l) => backend.listComments(recipeId, o, l), [recipeId], 15)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send(e: FormEvent) {
    e.preventDefault()
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    setError(null)
    try {
      const created = await backend.addComment(recipeId, body, {
        username: me.username,
        full_name: me.full_name,
        avatar_url: me.avatar_url,
      })
      list.setItems((items) => [created, ...items])
      onCountChange(1)
      setText('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się dodać komentarza.')
    } finally {
      setSending(false)
    }
  }

  async function remove(c: Comment) {
    if (!confirm('Usunąć ten komentarz?')) return
    try {
      await backend.deleteComment(c)
      list.setItems((items) => items.filter((x) => x.id !== c.id))
      onCountChange(-1)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Nie udało się usunąć komentarza.')
    }
  }

  return (
    <div>
      <form onSubmit={send} className="flex items-end gap-2">
        <Avatar name={me.username} src={me.avatar_url} size={34} />
        <div className="flex min-w-0 flex-1 items-end gap-2 rounded-[20px] bg-surface py-1.5 pr-1.5 pl-3.5">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX))}
            placeholder="Dodaj komentarz…"
            rows={1}
            aria-label="Komentarz"
            className="max-h-32 min-h-[28px] min-w-0 flex-1 resize-none bg-transparent py-1 leading-snug outline-none [field-sizing:content] placeholder:text-label-3"
          />
          <motion.button
            type="submit"
            whileTap={{ scale: 0.9 }}
            disabled={!text.trim() || sending}
            aria-label="Wyślij komentarz"
            className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-accent text-white transition-opacity disabled:opacity-30"
          >
            {sending ? <SpinnerIcon width={16} height={16} /> : <SendIcon width={16} height={16} strokeWidth={2.6} />}
          </motion.button>
        </div>
      </form>
      {text.length > MAX - 60 && <p className="mt-1 pr-2 text-right text-[12px] text-label-2">{text.length}/{MAX}</p>}
      {error && <p className="mt-2 px-1 text-[13px] text-red-500">{error}</p>}

      <ul className="mt-4 space-y-4">
        <AnimatePresence initial={false}>
          {list.items.map((c) => (
            <motion.li
              key={c.id}
              layout
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className="flex gap-2.5"
            >
              <button onClick={() => onOpenAuthor(c.author.username)} className="shrink-0 self-start" aria-label={`Profil ${c.author.username}`}>
                <Avatar name={c.author.username} src={c.author.avatar_url} size={34} />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-label-2">
                  <button onClick={() => onOpenAuthor(c.author.username)} className="font-semibold text-label">
                    {c.author.username}
                  </button>{' '}
                  · {timeAgo(c.created_at)}
                </p>
                <p className="text-[15px] leading-snug break-words whitespace-pre-wrap" data-selectable>
                  {c.body}
                </p>
              </div>
              {(c.user_id === me.id || isRecipeOwner) && (
                <button onClick={() => remove(c)} aria-label="Usuń komentarz" className="shrink-0 self-start p-1 text-label-3 active:text-red-500">
                  <TrashIcon width={16} height={16} />
                </button>
              )}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      {list.items.length === 0 && !list.loading && !list.error && (
        <p className="pt-4 text-center text-[14px] text-label-2">Jeszcze nikt nie skomentował. Napisz pierwszy komentarz.</p>
      )}
      <LoadMore loading={list.loading} done={list.done} error={list.error} onLoadMore={list.loadMore} onRetry={list.retry} />
    </div>
  )
}
