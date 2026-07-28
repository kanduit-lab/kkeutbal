'use client'

import { useEffect } from 'react'

export function useWakeLock(): void {
  useEffect(() => {
    if (!('wakeLock' in navigator)) return

    let disposed = false
    let sentinel: WakeLockSentinel | null = null

    const acquire = async () => {
      if (disposed || sentinel !== null || document.visibilityState !== 'visible') return
      try {
        const lock = await navigator.wakeLock.request('screen')
        if (disposed) {
          void lock.release().catch(() => {})
          return
        }
        sentinel = lock
        lock.addEventListener(
          'release',
          () => {
            if (disposed) return

            sentinel = null
            if (document.visibilityState === 'visible') void acquire()
          },
          { once: true },
        )
      } catch {}
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void acquire()
    }

    void acquire()
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      void sentinel?.release().catch(() => {})
      sentinel = null
    }
  }, [])
}