/**
 * iPhone w trybie aplikacji z ekranu głównego czasem zmniejsza widok o pas ze wskaźnikiem gestu
 * (po klawiaturze, gestach systemowych, powrocie z tła): `innerHeight` robi się niższe niż ekran,
 * a na dole pojawia się pusty pasek, który znika dopiero po odświeżeniu. Wysokość ekranu iPhone'a
 * jest stała, więc w tym trybie ustawiamy ją na sztywno (CSS: `html.fit-screen`) zamiast ufać
 * `innerHeight`, i pilnujemy jej także wtedy, gdy przeglądarka nie wyśle żadnego zdarzenia.
 */

export function isStandalone(): boolean {
  return (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches
}

const isIPhone = () => /iPhone|iPod/.test(navigator.userAgent)

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
  window.visualViewport?.addEventListener('resize', reset)
  window.visualViewport?.addEventListener('scroll', reset)
  document.addEventListener('focusout', () => setTimeout(reset, 60))
  document.addEventListener('visibilitychange', reset)
}

export function fitStandaloneViewport(): void {
  lockDocumentScroll()
  if (!isStandalone() || !isIPhone()) return
  const root = document.documentElement

  const apply = () => {
    // Na iOS screen.width/height zawsze opisują ekran w pionie, niezależnie od obrotu
    const tall = Math.max(screen.width, screen.height)
    const short = Math.min(screen.width, screen.height)
    const full = window.innerWidth > window.innerHeight ? short : tall
    const height = `${Math.max(full, window.innerHeight)}px`
    if (root.style.getPropertyValue('--app-height') !== height) root.style.setProperty('--app-height', height)
    if (!root.classList.contains('fit-screen')) root.classList.add('fit-screen')
  }

  apply()
  window.addEventListener('resize', apply)
  window.addEventListener('orientationchange', () => setTimeout(apply, 250))
  window.addEventListener('pageshow', apply)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && apply())
  document.addEventListener('focusout', () => setTimeout(apply, 100))
  // Siatka bezpieczeństwa na zmiany, o których system nie powiadamia; porównanie jest tanie
  setInterval(apply, 1000)
}
