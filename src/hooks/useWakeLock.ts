import { useEffect, useState } from 'react'

/** api = Screen Wake Lock, fallback = cichy film w pętli, none = nie udało się, pending = próbujemy */
export type WakeLockMode = 'pending' | 'api' | 'fallback' | 'none'

/** Film-zapas tworzymy dopiero, gdy API zawiedzie (dane ~12 kB ładują się wtedy osobnym fragmentem) */
async function startVideoFallback(): Promise<() => void> {
  const { NO_SLEEP_MP4, NO_SLEEP_WEBM } = await import('@/lib/noSleepMedia')
  const video = document.createElement('video')
  video.setAttribute('title', 'No Sleep')
  video.setAttribute('playsinline', '')
  video.muted = true
  for (const [type, src] of [
    ['webm', NO_SLEEP_WEBM],
    ['mp4', NO_SLEEP_MP4],
  ] as const) {
    const source = document.createElement('source')
    source.src = src
    source.type = `video/${type}`
    video.appendChild(source)
  }
  video.addEventListener('loadedmetadata', () => {
    if (video.duration <= 1) video.loop = true
    else video.addEventListener('timeupdate', () => void (video.currentTime > 0.5 && (video.currentTime = Math.random())))
  })
  await video.play() // wymaga gestu użytkownika (dotknięcie „Zacznij gotować”) — inaczej odrzuci
  return () => {
    video.pause()
    video.removeAttribute('src')
    video.load()
  }
}

/**
 * Nie pozwala ekranowi zgasnąć, dopóki `active` jest true. Najpierw Screen Wake Lock API; w iPhonie z ekranu głównego
 * (PWA) i w części przeglądarek bywa ono niedostępne lub odrzucane — wtedy puszczamy cichy film w pętli (sztuczka znana
 * z NoSleep.js), który wymaga gestu użytkownika, więc `active` powinno stać się true po dotknięciu przycisku.
 * Blokada API znika przy ukryciu karty — odnawiamy ją po powrocie. Zwalniamy wszystko po zamknięciu trybu gotowania.
 */
export function useWakeLock(active: boolean): WakeLockMode {
  const [mode, setMode] = useState<WakeLockMode>('pending')

  useEffect(() => {
    if (!active) return
    let stopped = false
    let sentinel: WakeLockSentinel | null = null
    let stopVideo: (() => void) | null = null

    async function acquire() {
      if (stopped) return
      try {
        if ('wakeLock' in navigator) {
          sentinel = await navigator.wakeLock.request('screen')
          if (stopped) return void sentinel.release().catch(() => undefined)
          setMode('api')
          return
        }
      } catch {
        /* odmowa (PWA na starszym iOS, oszczędzanie baterii, brak uprawnienia) — próbujemy filmu */
      }
      if (stopVideo) return
      try {
        const stop = await startVideoFallback()
        if (stopped) return stop()
        stopVideo = stop
        setMode('fallback')
      } catch {
        if (!stopped) setMode('none')
      }
    }

    void acquire()
    const onVisible = () => {
      if (document.visibilityState === 'visible' && (!sentinel || sentinel.released)) void acquire()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      document.removeEventListener('visibilitychange', onVisible)
      void sentinel?.release().catch(() => undefined)
      stopVideo?.()
      setMode('pending')
    }
  }, [active])

  return mode
}
