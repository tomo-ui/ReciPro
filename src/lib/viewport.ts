/**
 * iOS potrafi uruchomić aplikację z ekranu głównego z widokiem niższym niż ekran:
 * `innerHeight` nie obejmuje wtedy pasa ze wskaźnikiem gestu, a pod aplikacją widać czerń.
 * W trybie standalone wymuszamy więc wysokość równą wysokości ekranu (CSS: `html.fit-screen`).
 * Ograniczamy różnicę do rozmiaru pasa, żeby nie reagować na klawiaturę ani inne zmiany.
 */
const MAX_GAP = 100

export function isStandalone(): boolean {
  return (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches
}

export function fitStandaloneViewport(): void {
  if (!isStandalone()) return
  const root = document.documentElement

  const apply = () => {
    const tall = Math.max(screen.width, screen.height)
    const short = Math.min(screen.width, screen.height)
    const portrait = window.innerHeight >= window.innerWidth
    const full = portrait ? tall : short
    const gap = full - window.innerHeight
    if (gap > 0 && gap <= MAX_GAP) {
      root.style.setProperty('--app-height', `${full}px`)
      root.classList.add('fit-screen')
    } else {
      root.classList.remove('fit-screen')
      root.style.removeProperty('--app-height')
    }
  }

  apply()
  window.addEventListener('resize', apply)
  window.addEventListener('orientationchange', () => setTimeout(apply, 250))
  window.addEventListener('pageshow', apply)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && apply())
}
