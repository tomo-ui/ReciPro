/**
 * Układ ekranu na telefonie:
 *  1. iPhone w trybie aplikacji z ekranu głównego czasem zmniejsza widok o pas ze wskaźnikiem gestu
 *     (`innerHeight` niższe niż ekran, na dole pusty pasek do odświeżenia). Wysokość ekranu iPhone'a jest
 *     stała, więc w tym trybie ustawiamy ją na sztywno i pilnujemy jej także bez zdarzeń z systemu.
 *  2. Klawiatura ekranowa iOS nie zmniejsza układu strony, tylko przykrywa jego dół, więc pole tekstowe
 *     nisko na ekranie znika pod klawiaturą. Gdy klawiatura jest otwarta, skracamy aplikację do widocznej
 *     części (visualViewport), a po fokusie przewijamy pole na środek. Pasek zakładek na ten czas chowamy.
 *  Wynik trafia do CSS jako `html.fit-screen`, `html.kb-open` i zmienne `--app-height`, `--vv-top`.
 */

export function isStandalone(): boolean {
  return (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches
}

const isIPhone = () => /iPhone|iPod/.test(navigator.userAgent)

/** Klawiatura ma co najmniej tyle wysokości; mniejsze zmiany (paski przeglądarki) ignorujemy */
export const KEYBOARD_MIN_HEIGHT = 120

export interface LayoutInput {
  innerWidth: number
  innerHeight: number
  screenWidth: number
  screenHeight: number
  /** Widoczna część strony (visualViewport); brak = przeglądarka go nie zna */
  vvHeight?: number
  vvOffsetTop?: number
  /** Powiększenie palcami: przy zoomie visualViewport jest mniejszy, ale to nie klawiatura */
  vvScale?: number
  /** iPhone uruchomiony z ekranu głównego */
  standaloneIPhone: boolean
}

export interface Layout {
  /** Wysokość aplikacji w px; brak = zostaje to, co ustawi przeglądarka */
  height?: number
  /** Przesunięcie w dół (px), gdy iOS przesunął widoczną część strony nad klawiaturą */
  top: number
  keyboard: boolean
}

export function computeLayout(i: LayoutInput): Layout {
  // Na iOS screen.width/height zawsze opisują ekran w pionie, niezależnie od obrotu
  const tall = Math.max(i.screenWidth, i.screenHeight)
  const short = Math.min(i.screenWidth, i.screenHeight)
  const landscape = i.innerWidth > i.innerHeight
  const full = i.standaloneIPhone ? Math.max(landscape ? short : tall, i.innerHeight) : i.innerHeight

  const visible = i.vvHeight ?? full
  const zoomed = (i.vvScale ?? 1) > 1.05
  if (!zoomed && visible < full - KEYBOARD_MIN_HEIGHT) {
    return { height: Math.round(visible), top: Math.max(0, Math.round(i.vvOffsetTop ?? 0)), keyboard: true }
  }
  return i.standaloneIPhone ? { height: full, top: 0, keyboard: false } : { top: 0, keyboard: false }
}

/**
 * Aplikacja nigdy nie przewija dokumentu (przewijają się tylko wewnętrzne kontenery), a iOS po focusie
 * na polu i schowaniu klawiatury potrafi zostawić stronę przesuniętą w górę — pod spodem robi się pusty pas.
 * Cofamy każde przesunięcie dokumentu.
 */
export function lockDocumentScroll(): void {
  const reset = () => {
    if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0)
  }
  window.addEventListener('scroll', reset, { passive: true })
  document.addEventListener('focusout', () => setTimeout(reset, 60))
  document.addEventListener('visibilitychange', reset)
}

const TEXT_FIELD = 'input:not([type=file]):not([type=checkbox]):not([type=radio]):not([type=range]), textarea, select, [contenteditable=""], [contenteditable="true"]'

/** Margines (px) między polem a brzegiem widocznego obszaru, poniżej którego pole uznajemy za „przy krawędzi” */
export const REVEAL_PADDING = 20

/**
 * O ile przewinąć kontener, żeby pole było w pełni widoczne. Pole, które już jest widoczne z marginesem,
 * nie jest ruszane (0) — dzięki temu dotknięcie pola nie powoduje zbędnego przewijania. Pole spoza obszaru
 * trafia na jego środek, a pole wyższe niż obszar (długi textarea) — na górę.
 * Wartości dodatnie = przewiń w dół.
 */
export function revealDelta(field: { top: number; bottom: number }, area: { top: number; bottom: number }, padding = REVEAL_PADDING): number {
  const inView = field.top >= area.top + padding && field.bottom <= area.bottom - padding
  if (inView) return 0
  const tooTall = field.bottom - field.top > area.bottom - area.top - 2 * padding
  if (tooTall) return field.top - (area.top + padding)
  return (field.top + field.bottom) / 2 - (area.top + area.bottom) / 2
}

function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p
  }
  return null
}

/**
 * Po fokusie na polu przewija je nad klawiaturę — jednym ruchem, dopiero gdy układ przestał się zmieniać
 * (klawiatura wysunięta, aplikacja skrócona). Wcześniejsze dwa przewinięcia „na środek” nakładały się na
 * skracanie aplikacji i na własne przewijanie iOS, przez co ekran skakał.
 */
function revealFocusedField(): void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const vv = window.visualViewport

  const reveal = () => {
    const el = document.activeElement
    if (!(el instanceof HTMLElement) || !el.matches(TEXT_FIELD)) return
    const box = scrollParent(el)
    if (!box) return
    const f = el.getBoundingClientRect()
    const a = box.getBoundingClientRect()
    // Widoczny obszar: kontener przycięty do tego, co nie jest pod klawiaturą
    const bottom = Math.min(a.bottom, (vv ? vv.offsetTop + vv.height : window.innerHeight))
    const delta = revealDelta(f, { top: a.top, bottom })
    if (Math.abs(delta) < 3) return
    box.scrollBy({ top: delta, behavior: 'smooth' })
  }

  /** Czeka, aż zmiany rozmiaru widoku ustaną (koniec animacji klawiatury), z limitem, gdy żadna nie nadejdzie */
  const scheduleAfterSettle = (quiet: number, max: number) => {
    const started = Date.now()
    const tick = () => {
      if (Date.now() - lastChange >= quiet || Date.now() - started >= max) return reveal()
      timer = setTimeout(tick, 40)
    }
    clearTimeout(timer)
    lastChange = Date.now()
    timer = setTimeout(tick, quiet)
  }
  let lastChange = 0
  vv?.addEventListener('resize', () => (lastChange = Date.now()))

  document.addEventListener('focusin', (e) => {
    if (!(e.target instanceof HTMLElement) || !e.target.matches(TEXT_FIELD)) return
    scheduleAfterSettle(140, 700)
  })
}

export function installViewportFixes(): void {
  lockDocumentScroll()
  revealFocusedField()

  const root = document.documentElement
  const standaloneIPhone = isStandalone() && isIPhone()
  const vv = window.visualViewport

  const apply = () => {
    const layout = computeLayout({
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      screenWidth: screen.width,
      screenHeight: screen.height,
      vvHeight: vv?.height,
      vvOffsetTop: vv?.offsetTop,
      vvScale: vv?.scale,
      standaloneIPhone,
    })
    const height = layout.height === undefined ? '' : `${layout.height}px`
    if (root.style.getPropertyValue('--app-height') !== height) {
      if (height) root.style.setProperty('--app-height', height)
      else root.style.removeProperty('--app-height')
    }
    const top = `${layout.top}px`
    if (root.style.getPropertyValue('--vv-top') !== top) root.style.setProperty('--vv-top', top)
    root.classList.toggle('fit-screen', layout.height !== undefined)
    root.classList.toggle('kb-open', layout.keyboard)
  }

  apply()
  window.addEventListener('resize', apply)
  window.addEventListener('orientationchange', () => setTimeout(apply, 250))
  window.addEventListener('pageshow', apply)
  vv?.addEventListener('resize', apply)
  vv?.addEventListener('scroll', apply)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && apply())
  document.addEventListener('focusout', () => setTimeout(apply, 100))
  // Siatka bezpieczeństwa na zmiany, o których system nie powiadamia (iPhone z ekranu głównego); porównanie jest tanie
  if (standaloneIPhone) setInterval(apply, 1000)
}
