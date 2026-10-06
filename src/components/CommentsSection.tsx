import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Comment, Profile, ProfileSummary } from '@/types/recipe'
import { backend } from '@/lib/data'
import { emit } from '@/lib/events'
import { openModeration } from '@/lib/moderationUi'
import { timeAgo } from '@/lib/ui'
import { usePaged } from '@/hooks/usePaged'
import { Avatar } from './Avatar'
import { VerifiedBadge } from './VerifiedBadge'
import { HeartIcon, MoreIcon, SendIcon, SpinnerIcon, TrashIcon } from './Icons'
import { LoadMore } from './LoadMore'

const MAX = 500
/** Token „@nazwa” pisany właśnie teraz, tuż przed kursorem (spacja albo początek linii przed @) */
const MENTION_TOKEN_RE = /(?:^|\s)@([a-zA-Z0-9_.]{0,30})$/
/** Wszystkie „@nazwa” w już wysłanym komentarzu — do podświetlenia na pomarańczowo */
const MENTION_SPLIT_RE = /(@[a-zA-Z0-9_.]+)/g

interface Props {
  recipeId: string
  me: Profile
  /** Autor przepisu może usuwać każdy komentarz pod nim */
  isRecipeOwner: boolean
  onOpenAuthor: (username: string) => void
  /** Zmiana liczby komentarzy (+1 / −1), żeby rodzic zaktualizował licznik */
  onCountChange: (delta: number) => void
  /** Kursor od razu w polu nowego komentarza (klawiatura się wysuwa) */
  autoFocus?: boolean
  /** Dotknięcie pola tekstowego — rodzic może na tej podstawie rozszerzyć panel (patrz Sheet.tsx) */
  onComposerFocusChange?: (focused: boolean) => void
}

/** Treść komentarza z „@nazwa” podświetlonymi na pomarańczowo (kolor akcentu) */
function renderBody(body: string) {
  return body.split(MENTION_SPLIT_RE).map((part, i) => (part.startsWith('@') ? (
    <span key={i} className="font-semibold text-accent">{part}</span>
  ) : (
    <span key={i}>{part}</span>
  )))
}

export function CommentsSection({ recipeId, me, isRecipeOwner, onOpenAuthor, onCountChange, autoFocus, onComposerFocusChange }: Props) {
  const list = usePaged((o, l) => backend.listComments(recipeId, o, l), [recipeId], 15)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Fokus przy montowaniu: atrybut autoFocus działa w gestcie dotknięcia, a to jest zapas dla przeglądarek, które go pomijają
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus({ preventScroll: true })
  }, [autoFocus])

  /* — podpowiedzi @nazwa podczas pisania, jak w Instagramie — */
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<ProfileSummary[]>([])
  useEffect(() => {
    if (mentionQuery === null) {
      setSuggestions([])
      return
    }
    let alive = true
    backend
      .searchProfiles(mentionQuery, 0, 6)
      .then((r) => alive && setSuggestions(r))
      .catch(() => alive && setSuggestions([]))
    return () => {
      alive = false
    }
  }, [mentionQuery])

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value.slice(0, MAX)
    setText(value)
    const pos = e.target.selectionStart ?? value.length
    const m = MENTION_TOKEN_RE.exec(value.slice(0, pos))
    setMentionQuery(m ? m[1] : null)
  }

  function pickMention(username: string) {
    const el = inputRef.current
    const pos = el?.selectionStart ?? text.length
    const m = MENTION_TOKEN_RE.exec(text.slice(0, pos))
    if (!m) return
    const start = pos - m[1].length - 1 // pozycja znaku „@”
    const next = `${text.slice(0, start)}@${username} ${text.slice(pos)}`
    setText(next)
    setMentionQuery(null)
    setSuggestions([])
    const caret = start + username.length + 2
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(caret, caret)
    })
  }

  async function send() {
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    setError(null)
    try {
      const created = await backend.addComment(recipeId, body, {
        username: me.username,
        full_name: me.full_name,
        avatar_url: me.avatar_url,
        verified_badge: me.verified_badge,
      })
      list.setItems((items) => [created, ...items])
      onCountChange(1)
      emit('comments-changed')
      setText('')
      setMentionQuery(null)
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
      emit('comments-changed')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Nie udało się usunąć komentarza.')
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  async function toggleLike(c: Comment) {
    const nextLiked = !c.liked
    list.setItems((items) =>
      items.map((x) => (x.id === c.id ? { ...x, liked: nextLiked, like_count: Math.max(0, x.like_count + (nextLiked ? 1 : -1)) } : x)),
    )
    try {
      await (nextLiked ? backend.likeComment(c.id) : backend.unlikeComment(c.id))
    } catch (err) {
      list.setItems((items) => items.map((x) => (x.id === c.id ? c : x)))
      alert(err instanceof Error ? err.message : 'Nie udało się zmienić polubienia komentarza.')
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Lista komentarzy — jedyna przewijana część; pole niżej zostaje na stałe u dołu panelu */}
      <div className="scroll-y min-h-0 flex-1">
        <ul className="space-y-4 pb-3">
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
                  <p className="flex items-center text-[13px] text-label-2">
                    <button onClick={() => onOpenAuthor(c.author.username)} className="font-semibold text-label">
                      {c.author.username}
                    </button>
                    <VerifiedBadge badge={c.author.verified_badge} size={12} className="align-baseline" />
                    <span className="ml-1.5">· {timeAgo(c.created_at)}</span>
                  </p>
                  <p className="text-[15px] leading-snug break-words whitespace-pre-wrap" data-selectable>
                    {renderBody(c.body)}
                  </p>
                </div>
                {/* Serce z licznikiem po prawej, w linii z awatarem — jak w Instagramie */}
                <button
                  onClick={() => toggleLike(c)}
                  aria-label={c.liked ? 'Cofnij polubienie komentarza' : 'Polub komentarz'}
                  aria-pressed={c.liked}
                  className={`flex shrink-0 flex-col items-center gap-0.5 self-start pt-0.5 transition-colors ${c.liked ? 'text-red-500' : 'text-label-2'}`}
                >
                  <HeartIcon width={14} height={14} filled={c.liked} />
                  {c.like_count > 0 && <span className="text-[11px] tabular-nums">{c.like_count}</span>}
                </button>
                {c.user_id !== me.id && (
                  <button
                    onClick={() => openModeration({ target: { type: 'comment', id: c.id }, userId: c.user_id, username: c.author.username, label: `Komentarz @${c.author.username}: ${c.body.slice(0, 60)}` })}
                    aria-label="Więcej: zgłoś lub zablokuj"
                    className="shrink-0 self-start p-1 text-label-3 active:text-label"
                  >
                    <MoreIcon width={16} height={16} />
                  </button>
                )}
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

      {/* Pole komentarza — zawsze u dołu panelu; gdy panel rośnie nad klawiaturę (Sheet.tsx), jedzie razem z nim */}
      <div className="shrink-0 pt-3">
        {/* `div`, nie `form`: formularz z polem tekstowym wywołuje natywny pasek nawigacji iOS nad klawiaturą */}
        <div className="relative flex items-center gap-2.5">
          {mentionQuery !== null && suggestions.length > 0 && (
            <div className="absolute bottom-full left-0 z-10 mb-2 max-h-56 w-full overflow-y-auto rounded-[14px] bg-surface shadow-lg">
              {suggestions.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pickMention(p.username)}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left active:bg-surface-2"
                >
                  <Avatar name={p.username} src={p.avatar_url} size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center text-[14px] font-semibold">
                      <span className="truncate">{p.username}</span>
                      <VerifiedBadge badge={p.verified_badge} size={12} />
                    </span>
                    {p.full_name && <span className="block truncate text-[12px] text-label-2">{p.full_name}</span>}
                  </span>
                </button>
              ))}
            </div>
          )}
          <Avatar name={me.username} src={me.avatar_url} size={34} />
          {/* Wyraźnie obrysowane pole obok mojego zdjęcia; po dotknięciu podświetla się na kolor akcentu */}
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-[20px] border-[1.5px] border-label-3 bg-surface py-0.5 pr-1 pl-3.5 transition-[border-color,box-shadow] focus-within:border-accent focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_25%,transparent)]">
            <textarea
              ref={inputRef}
              autoFocus={autoFocus}
              value={text}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onFocus={() => onComposerFocusChange?.(true)}
              placeholder="Dodaj komentarz…"
              rows={1}
              aria-label="Komentarz"
              className="max-h-32 min-h-[28px] min-w-0 flex-1 resize-none bg-transparent py-1 leading-snug outline-none [field-sizing:content] placeholder:text-label-3"
            />
            <motion.button
              type="button"
              onClick={() => void send()}
              whileTap={{ scale: 0.9 }}
              disabled={!text.trim() || sending}
              aria-label="Wyślij komentarz"
              className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-accent text-white transition-opacity disabled:opacity-30"
            >
              {sending ? <SpinnerIcon width={16} height={16} /> : <SendIcon width={15} height={15} strokeWidth={2.6} />}
            </motion.button>
          </div>
        </div>
        {text.length > MAX - 60 && <p className="mt-1 pr-2 text-right text-[12px] text-label-2">{text.length}/{MAX}</p>}
        {error && <p className="mt-2 px-1 text-[13px] text-red-500">{error}</p>}
      </div>
    </div>
  )
}
