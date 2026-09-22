import { useEffect, useRef, useState, type ComponentType, type PointerEvent as ReactPointerEvent, type SVGProps } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { HOLD_MS, HOLD_MOVE_TOLERANCE, rimAngleAfter, slotIndexAt, type SlotMetric } from '@/lib/tabScrub'
import { BookIcon, HomeIcon, PlusIcon, SearchIcon, UserIcon } from './Icons'

export type Tab = 'feed' | 'search' | 'mine' | 'profile'

type IconType = ComponentType<SVGProps<SVGSVGElement>>

type Slot = { kind: 'tab'; id: Tab; label: string; Icon: IconType } | { kind: 'add'; label: string }

/** Układ: Feed, Szukaj, [+ dodaj przepis], Przepisy, Profil — bez podpisów, z nazwami dla czytników ekranu */
const SLOTS: Slot[] = [
  { kind: 'tab', id: 'feed', label: 'Feed', Icon: HomeIcon },
  { kind: 'tab', id: 'search', label: 'Szukaj', Icon: SearchIcon },
  { kind: 'add', label: 'Dodaj przepis' },
  { kind: 'tab', id: 'mine', label: 'Moje przepisy', Icon: BookIcon },
  { kind: 'tab', id: 'profile', label: 'Profil', Icon: UserIcon },
]

interface Props {
  tab: Tab
  onChange: (t: Tab) => void
  /** Plus na środku: otwiera dodawanie przepisu */
  onAdd: () => void
  badges?: Partial<Record<Tab, number>>
  /** Na moim profilu wężyk na obwódce płynnie zmienia się z białego w tęczowy i powoli płynie kolorami */
  rainbow?: boolean
}

const LENS_SCALE = 1.34
/** Pełny obieg kolorów tęczowego wężyka (ms): powoli */
const RAINBOW_CYCLE_MS = 14000
/** Na profilu wężyk sam okrąża pasek (stopnie na sekundę), niezależnie od przewijania: szybko, pełne okrążenie co 2 s */
const AUTO_SWIM_DEG_PER_SEC = 180

/**
 * Dolny pasek w stylu „liquid glass” z iOS 26: pływająca kapsuła, szkło z rozmyciem tła, połyskiem i jasną krawędzią
 * (index.css, `.liquid-glass`); zaznaczona zakładka to szklana kapsuła, która sprężyście przesuwa się między ikonami.
 * Pasek jest węższy od kart, żeby jego krawędzie nie nakładały się z krawędziami treści.
 *
 * Przytrzymanie palca na pasku powiększa „soczewkę” pod palcem (jak w Threads): można ją przeciągać nad inne zakładki,
 * a ekran zmienia się dopiero po puszczeniu palca nad wybraną zakładką. Zwykłe dotknięcie działa jak zwykle.
 */
export function TabBar({ tab, onChange, onAdd, badges = {}, rainbow = false }: Props) {
  const barRef = useRef<HTMLDivElement>(null)
  const slotRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [scrub, setScrub] = useState<{ index: number; metrics: SlotMetric[] } | null>(null)

  // Stan gestu trzymamy w refach, żeby handlery nie zależały od renderów
  const hold = useRef<{ timer?: ReturnType<typeof setTimeout>; startX: number; startY: number } | null>(null)
  const scrubbing = useRef(false)
  const suppressClick = useRef(false)

  const measure = (): SlotMetric[] => slotRefs.current.map((b) => ({ left: b?.offsetLeft ?? 0, width: b?.offsetWidth ?? 0 }))

  function cancelHold() {
    if (hold.current?.timer) clearTimeout(hold.current.timer)
    hold.current = null
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const slot = (e.target as HTMLElement).closest<HTMLElement>('[data-slot]')
    if (!slot) return
    const pressed = Number(slot.dataset.slot)
    cancelHold()
    const pointerId = e.pointerId
    hold.current = {
      startX: e.clientX,
      startY: e.clientY,
      timer: setTimeout(() => {
        scrubbing.current = true
        try {
          barRef.current?.setPointerCapture(pointerId) // ruch palca jest śledzony także poza paskiem
        } catch {
          /* brak przechwytywania (np. zdarzenie syntetyczne) — ruch i tak dociera z paska */
        }
        navigator.vibrate?.(8)
        setScrub({ index: pressed, metrics: measure() })
      }, HOLD_MS),
    }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const h = hold.current
    if (!h) return
    if (!scrubbing.current) {
      // ruch przed upływem czasu przytrzymania = zwykły gest (np. przeciągnięcie), nie soczewka
      if (Math.hypot(e.clientX - h.startX, e.clientY - h.startY) > HOLD_MOVE_TOLERANCE) cancelHold()
      return
    }
    const bar = barRef.current
    if (!bar) return
    const x = e.clientX - bar.getBoundingClientRect().left
    setScrub((s) => {
      if (!s) return s
      const index = slotIndexAt(x, s.metrics)
      if (index !== s.index) navigator.vibrate?.(5)
      return index === s.index ? s : { ...s, index }
    })
  }

  function endGesture(commit: boolean) {
    const wasScrubbing = scrubbing.current
    const index = scrub?.index
    cancelHold()
    scrubbing.current = false
    if (!wasScrubbing) return
    // po puszczeniu przeglądarka wyśle jeszcze „click” — pomijamy go, bo wybór już zrobiliśmy
    suppressClick.current = true
    setTimeout(() => (suppressClick.current = false), 400)
    setScrub(null)
    if (commit && index !== undefined) activate(index)
  }

  function activate(index: number) {
    const slot = SLOTS[index]
    if (slot.kind === 'add') onAdd()
    else if (slot.id !== tab) onChange(slot.id)
  }

  useEffect(() => () => cancelHold(), [])

  // Tęcza wężyka i samoistne pływanie: --rainbow płynnie (wykładniczo, ok. 0,3 s) dąży do 1 na profilu i do 0 poza nim, a --snake-hue
  // przesuwa kolory o pełne koło co ~14 s (powoli „płynie”). Pętla działa tylko dopóki tęcza jest widoczna.
  const rainbowValue = useRef(0)
  const hue = useRef(0)
  /** Kąt wężyka na obwódce (stopnie): zmieniają go przewijanie (efekt niżej) i samoistne pływanie na profilu */
  const rimAngle = useRef(0)
  useEffect(() => {
    const bar = barRef.current
    if (!bar) return
    const target = rainbow ? 1 : 0
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
      rainbowValue.current = target // bez ruchu: kolory zmieniają się od razu i stoją w miejscu
      bar.style.setProperty('--rainbow', String(target))
      return
    }
    let raf = 0
    let last = performance.now()
    const step = (now: number) => {
      const dt = Math.min(64, now - last)
      last = now
      rainbowValue.current += (target - rainbowValue.current) * (1 - Math.exp(-dt / 300))
      hue.current = (hue.current + (dt * 360) / RAINBOW_CYCLE_MS) % 360
      // samoistne pływanie po pasku, płynnie rozpędzane i wygaszane razem z tęczą (bez przewijania)
      rimAngle.current = (rimAngle.current + (dt / 1000) * AUTO_SWIM_DEG_PER_SEC * rainbowValue.current) % 360
      const done = target === 0 && rainbowValue.current < 0.003
      if (done) rainbowValue.current = 0
      bar.style.setProperty('--rainbow', rainbowValue.current.toFixed(3))
      bar.style.setProperty('--snake-hue', hue.current.toFixed(1))
      bar.style.setProperty('--rim-angle', `${rimAngle.current.toFixed(2)}deg`)
      if (!done) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [rainbow])

  // Wężyk na obwódce: kąt rośnie o tyle, ile pikseli przesunęła się treść (1 px przewinięcia = 1 px po obwodzie paska),
  // więc wolniejsze przewijanie daje wolniejszy ruch, a szybsze — szybszy; w górę wężyk biegnie w drugą stronę
  useEffect(() => {
    const bar = barRef.current
    if (!bar || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)) return
    let queued = false
    const lastTop = new WeakMap<EventTarget, number>()
    const onScroll = (e: Event) => {
      const el = e.target
      if (!(el instanceof HTMLElement)) return
      const top = el.scrollTop
      const prev = lastTop.get(el)
      lastTop.set(el, top)
      if (prev === undefined || top === prev) return
      const r = bar.getBoundingClientRect()
      rimAngle.current = rimAngleAfter(rimAngle.current, top - prev, r.width, r.height)
      if (!queued) {
        queued = true
        requestAnimationFrame(() => {
          queued = false
          bar.style.setProperty('--rim-angle', `${rimAngle.current}deg`)
        })
      }
    }
    // zdarzenie scroll nie bąbelkuje, ale da się je złapać w fazie przechwytywania na całym dokumencie
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => document.removeEventListener('scroll', onScroll, { capture: true })
  }, [])

  const metric = scrub?.metrics[scrub.index]

  return (
    <nav aria-label="Nawigacja" className="pointer-events-none fixed inset-x-0 bottom-0 z-20 px-9" style={{ paddingBottom: TAB_BAR_BOTTOM }}>
      <div
        ref={barRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => endGesture(true)}
        onPointerCancel={() => endGesture(false)}
        onContextMenu={(e) => e.preventDefault()}
        className="liquid-glass liquid-glass-snake pointer-events-auto relative mx-auto flex h-[64px] max-w-md touch-none items-stretch rounded-full px-1 select-none [-webkit-touch-callout:none]"
      >
        {/* Soczewka pod palcem: powiększona kapsuła, która podąża za palcem między zakładkami */}
        <AnimatePresence>
          {scrub && metric && (
            <motion.span
              key="lens"
              aria-hidden
              className="liquid-lens pointer-events-none absolute top-[5px] bottom-[5px] left-0 rounded-full"
              style={{ width: metric.width }}
              initial={{ x: metric.left, scale: 1, opacity: 0 }}
              animate={{ x: metric.left, scale: LENS_SCALE, opacity: 1 }}
              exit={{ scale: 1, opacity: 0, transition: { duration: 0.18 } }}
              transition={{ type: 'spring', stiffness: 520, damping: 34, mass: 0.8 }}
            />
          )}
        </AnimatePresence>

        {SLOTS.map((slot, i) => {
          const hovered = scrub?.index === i
          if (slot.kind === 'add') {
            return (
              <button
                key="add"
                ref={(el) => {
                  slotRefs.current[i] = el
                }}
                data-slot={i}
                onClick={() => !suppressClick.current && onAdd()}
                aria-label={slot.label}
                className="relative flex h-full flex-1 items-center justify-center"
              >
                <motion.span
                  animate={{ scale: hovered ? 1.3 : 1 }}
                  whileTap={{ scale: hovered ? 1.3 : 0.8, rotate: hovered ? 0 : 90 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 24 }}
                  className="text-accent"
                >
                  <PlusIcon width={31} height={31} strokeWidth={2.5} />
                </motion.span>
              </button>
            )
          }
          const { id, label, Icon } = slot
          const active = id === tab
          const badge = badges[id] ?? 0
          return (
            <button
              key={id}
              ref={(el) => {
                slotRefs.current[i] = el
              }}
              data-slot={i}
              onClick={() => !suppressClick.current && onChange(id)}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              className="relative flex h-full flex-1 items-center justify-center"
            >
              {active && (
                <motion.span
                  layoutId="tab-pill"
                  animate={{ opacity: scrub ? 0 : 1 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 34, mass: 0.9 }}
                  className="liquid-pill absolute inset-y-[5px] inset-x-[1px] rounded-full"
                />
              )}
              <motion.span
                animate={{ scale: hovered ? 1.3 : 1 }}
                whileTap={{ scale: hovered ? 1.3 : 0.86 }}
                transition={{ type: 'spring', stiffness: 500, damping: 26 }}
                className={`relative transition-colors ${active || hovered ? 'text-label' : 'text-label-2'}`}
              >
                <Icon width={26} height={26} strokeWidth={active || hovered ? 2.3 : 1.9} />
                <AnimatePresence>
                  {badge > 0 && (
                    <motion.span
                      key="badge"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                      aria-label={`Nowe powiadomienia: ${badge}`}
                      className="absolute -top-1.5 -right-2.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-red-500 px-1 text-[11px] leading-none font-bold text-white tabular-nums"
                    >
                      {badge > 99 ? '99+' : badge}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

/** Odstęp paska od dołu ekranu: część safe-area (wskaźnik gestu), żeby pasek „pływał” tuż nad nim */
const TAB_BAR_BOTTOM = 'calc(env(safe-area-inset-bottom, 0px) * 0.6 + 8px)'

/** Wysokość pływającego paska + jego odstęp od dołu + zapas — dolny margines przewijanej treści */
export const TAB_BAR_PADDING = 'calc(env(safe-area-inset-bottom, 0px) * 0.6 + 8px + 64px + 24px)'
