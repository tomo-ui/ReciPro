import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import type { StepLine } from '@/types/recipe'
import { findTimers, formatClock } from '@/lib/cooking'
import { spring } from '@/lib/ui'
import { useWakeLock } from '@/hooks/useWakeLock'
import { ChevronLeftIcon, ChevronRightIcon, ClockIcon, RowsIcon, VolumeIcon, XIcon } from './Icons'

interface Props {
  title: string
  steps: StepLine[]
  /** Składniki w aktualnie wybranej liczbie porcji (po przeliczeniu), z grupami */
  ingredients: { text: string; group?: string }[]
  /** Np. „Przeliczono na 6 porcji” — pokazujemy nad listą składników */
  servingsNote?: string
  onClose: () => void
}

interface RunningTimer {
  id: number
  label: string
  endsAt: number
  /** Alarm już zagrał */
  done: boolean
}

/** Rozmiary tekstu kroku (px): zmieniane przyciskiem „Aa”; wybór zapamiętujemy między przepisami */
const FONT_SIZES = [24, 28, 34, 42]
const FONT_KEY = 'przepisy:v2:cookingFont'

function loadFontIndex(): number {
  try {
    const v = Number(localStorage.getItem(FONT_KEY))
    return Number.isInteger(v) && v >= 0 && v < FONT_SIZES.length ? v : 1
  } catch {
    return 1
  }
}

/** Dźwięk i wibracja po upływie czasu timera (działa po geście użytkownika, którym był start timera) */
function alarm() {
  try {
    navigator.vibrate?.([300, 150, 300, 150, 600])
  } catch {
    /* brak wibracji */
  }
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    ;[0, 0.35, 0.7].forEach((delay) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + delay)
      gain.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + delay + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + 0.28)
      osc.connect(gain).connect(ctx.destination)
      osc.start(ctx.currentTime + delay)
      osc.stop(ctx.currentTime + delay + 0.3)
    })
    setTimeout(() => void ctx.close().catch(() => undefined), 1500)
  } catch {
    /* brak audio */
  }
}

/**
 * Tryb gotowania: ekran nie gaśnie (useWakeLock), jeden krok na ekranie dużą czcionką, przesunięcie palcem albo duże
 * przyciski przełączają kroki, a czasy z treści kroku („piecz 45 minut”) można jednym dotknięciem zamienić w timer.
 * Składniki są pod ręką w arkuszu. Opcjonalnie lektor czyta krok na głos.
 */
export function CookingMode({ title, steps, ingredients, servingsNote, onClose }: Props) {
  const wake = useWakeLock(true)
  const [index, setIndex] = useState(0)
  const [fontIndex, setFontIndex] = useState(loadFontIndex)
  const [showIngredients, setShowIngredients] = useState(false)
  const [timers, setTimers] = useState<RunningTimer[]>([])
  const [now, setNow] = useState(() => Date.now())
  const [reading, setReading] = useState(false)
  const timerSeq = useRef(0)

  const total = steps.length
  const step = steps[index]
  const stepTimers = useMemo(() => findTimers(step?.text ?? ''), [step])
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window
  const last = index === total - 1

  const go = useCallback((delta: number) => setIndex((i) => Math.min(total - 1, Math.max(0, i + delta))), [total])

  // Zegar timerów: tyka tylko, gdy jakiś timer trwa
  const running = timers.some((t) => !t.done)
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [running])
  useEffect(() => {
    const finished = timers.filter((t) => !t.done && t.endsAt <= now)
    if (finished.length === 0) return
    alarm()
    setTimers((list) => list.map((t) => (finished.some((f) => f.id === t.id) ? { ...t, done: true } : t)))
  }, [now, timers])

  // Klawiatura (tablet/komputer): strzałki i Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === 'Escape') (showIngredients ? setShowIngredients(false) : onClose())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, onClose, showIngredients])

  // Lektor: czyta bieżący krok, gdy włączony; zawsze milknie po zamknięciu trybu gotowania
  useEffect(() => {
    if (!canSpeak) return
    window.speechSynthesis.cancel()
    if (reading && step) {
      const u = new SpeechSynthesisUtterance(step.text)
      u.lang = 'pl-PL'
      window.speechSynthesis.speak(u)
    }
  }, [reading, step, canSpeak])
  useEffect(() => () => (canSpeak ? window.speechSynthesis.cancel() : undefined), [canSpeak])

  function startTimer(label: string, seconds: number) {
    const t: RunningTimer = { id: ++timerSeq.current, label, endsAt: Date.now() + seconds * 1000, done: false }
    setNow(Date.now())
    setTimers((list) => [...list, t])
  }

  function changeFont() {
    const next = (fontIndex + 1) % FONT_SIZES.length
    setFontIndex(next)
    try {
      localStorage.setItem(FONT_KEY, String(next))
    } catch {
      /* pamięć niedostępna — rozmiar nie przetrwa */
    }
  }

  if (!step) return null
  const grouped = ingredients.reduce<{ name?: string; items: string[] }[]>((acc, i) => {
    const lastGroup = acc[acc.length - 1]
    if (lastGroup && lastGroup.name === i.group) lastGroup.items.push(i.text)
    else acc.push({ name: i.group, items: [i.text] })
    return acc
  }, [])

  // Portal: ekran szczegółów przepisu ma własną transformację (wjazd z boku), która rozstawiłaby `fixed` względem siebie
  return createPortal(
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={`Gotowanie: ${title}`}
      className="fixed inset-0 z-[60] flex flex-col bg-bg"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      transition={spring}
    >
      <header className="shrink-0 pt-safe-top">
        <div className="flex h-12 items-center gap-2 px-[max(12px,env(safe-area-inset-left))]">
          <button onClick={onClose} aria-label="Zakończ gotowanie" className="flex h-10 w-10 items-center justify-center rounded-full bg-surface active:opacity-60">
            <XIcon width={20} height={20} />
          </button>
          <p className="min-w-0 flex-1 truncate text-center text-[15px] font-semibold">{title}</p>
          {canSpeak && (
            <button
              onClick={() => setReading((r) => !r)}
              aria-label={reading ? 'Wyłącz czytanie na głos' : 'Czytaj kroki na głos'}
              aria-pressed={reading}
              className={`flex h-10 w-10 items-center justify-center rounded-full active:opacity-60 ${reading ? 'bg-accent text-white' : 'bg-surface'}`}
            >
              <VolumeIcon width={20} height={20} />
            </button>
          )}
          <button onClick={changeFont} aria-label="Zmień rozmiar tekstu" className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-[15px] font-bold active:opacity-60">
            <span className="text-[12px]">A</span>
            <span className="text-[19px]">A</span>
          </button>
        </div>
        <div className="mx-[max(16px,env(safe-area-inset-left))] h-1 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={index + 1}>
          <motion.div className="h-full rounded-full bg-accent" animate={{ width: `${((index + 1) / total) * 100}%` }} transition={{ duration: 0.25 }} />
        </div>
        {wake === 'none' && (
          <p className="mx-4 mt-2 rounded-[10px] bg-surface px-3 py-1.5 text-center text-[12px] text-label-2">
            Nie udało się utrzymać ekranu włączonego — ustaw dłuższy czas blokady ekranu w systemie.
          </p>
        )}
      </header>

      {timers.length > 0 && (
        <div className="flex shrink-0 gap-2 overflow-x-auto px-4 pt-3 pb-1">
          {timers.map((t) => (
            <button
              key={t.id}
              onClick={() => setTimers((list) => list.filter((x) => x.id !== t.id))}
              aria-label={t.done ? `Czas minął: ${t.label}. Zamknij` : `Timer ${t.label}. Zatrzymaj`}
              className={`flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-[15px] font-semibold tabular-nums ${t.done ? 'animate-pulse bg-red-500 text-white' : 'bg-accent text-white'}`}
            >
              <ClockIcon width={16} height={16} />
              {t.done ? 'Czas minął!' : formatClock((t.endsAt - now) / 1000)}
              <span className="text-[12px] font-normal opacity-80">{t.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Przesunięcie w bok = następny/poprzedni krok; pionowe przewijanie dłuższego kroku działa normalnie */}
      <motion.div
        className="scroll-y flex-1 px-[max(24px,env(safe-area-inset-left))] py-6"
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.25}
        onDragEnd={(_, info) => {
          if (info.offset.x < -80 || info.velocity.x < -500) go(1)
          else if (info.offset.x > 80 || info.velocity.x > 500) go(-1)
        }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={index}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.16 }}
            className="mx-auto flex min-h-full max-w-2xl flex-col justify-center"
          >
            <p className="text-[14px] font-semibold tracking-wide text-accent uppercase">
              Krok {index + 1} z {total}
              {step.group ? ` · ${step.group}` : ''}
            </p>
            <p className="mt-3 leading-snug font-semibold" style={{ fontSize: FONT_SIZES[fontIndex] }} data-selectable>
              {step.text}
            </p>
            {stepTimers.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-2.5">
                {stepTimers.map((t) => (
                  <motion.button
                    key={t.seconds}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => startTimer(t.label, t.seconds)}
                    className="flex items-center gap-2 rounded-full bg-surface px-4 py-2.5 text-[16px] font-semibold active:bg-surface-2"
                  >
                    <ClockIcon width={18} height={18} className="text-accent" />
                    Timer {formatClock(t.seconds)}
                  </motion.button>
                ))}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>

      <footer className="shrink-0 px-4 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+14px)]">
        <div className="mx-auto flex max-w-2xl items-stretch gap-2.5">
          <button
            onClick={() => setShowIngredients(true)}
            aria-label="Składniki"
            className="flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-[18px] bg-surface text-[11px] font-medium active:bg-surface-2"
          >
            <RowsIcon width={22} height={22} />
            Składniki
          </button>
          <button
            onClick={() => go(-1)}
            disabled={index === 0}
            aria-label="Poprzedni krok"
            className="flex h-16 flex-1 items-center justify-center rounded-[18px] bg-surface active:bg-surface-2 disabled:opacity-30"
          >
            <ChevronLeftIcon width={30} height={30} />
          </button>
          <button
            onClick={() => (last ? onClose() : go(1))}
            aria-label={last ? 'Zakończ gotowanie' : 'Następny krok'}
            className="flex h-16 flex-[1.6] items-center justify-center gap-1 rounded-[18px] bg-accent text-[19px] font-bold text-white active:opacity-80"
          >
            {last ? (
              'Gotowe 🎉'
            ) : (
              <>
                Dalej <ChevronRightIcon width={26} height={26} />
              </>
            )}
          </button>
        </div>
      </footer>

      <AnimatePresence>
        {showIngredients && (
          <>
            <motion.div className="absolute inset-0 z-10 bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowIngredients(false)} />
            <motion.div
              className="absolute inset-x-0 bottom-0 z-20 flex max-h-[75%] flex-col rounded-t-[28px] bg-bg pb-[calc(env(safe-area-inset-bottom,0px)+12px)] shadow-2xl"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={spring}
              role="dialog"
              aria-label="Składniki"
            >
              <div className="flex h-12 shrink-0 items-center justify-between px-5">
                <h2 className="text-[18px] font-bold">Składniki</h2>
                <button onClick={() => setShowIngredients(false)} className="text-[17px] font-semibold text-accent active:opacity-50">
                  Gotowe
                </button>
              </div>
              <div className="scroll-y px-4 pb-3">
                {servingsNote && <p className="mb-2 px-1 text-[13px] text-label-2">{servingsNote}</p>}
                {grouped.map((g, gi) => (
                  <div key={gi} className="mb-3 last:mb-0">
                    {g.name && <p className="mb-1 text-[13px] font-semibold text-label-2 uppercase">{g.name}</p>}
                    <ul className="divide-y divide-separator overflow-hidden rounded-[14px] bg-surface">
                      {g.items.map((text, k) => (
                        <li key={k} className="px-4 py-3 text-[17px]">
                          {text}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>,
    document.body,
  )
}
