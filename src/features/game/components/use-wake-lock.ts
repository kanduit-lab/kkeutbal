'use client'

import { useEffect } from 'react'

/**
 * 화면 꺼짐 방지 훅 — 전광판(모니터)처럼 계속 켜져 있어야 하는 화면에서 쓴다.
 *
 * Screen Wake Lock API 는 탭이 백그라운드로 가면 브라우저가 락을 스스로 해제한다.
 * 그래서 release·visibilitychange(visible) 때 다시 잡는다. 미지원 브라우저·저전력 모드·
 * 권한 거부는 조용히 무시한다 — 락이 없어도 화면 기능 자체는 그대로 동작한다.
 */
export function useWakeLock(): void {
  useEffect(() => {
    if (!('wakeLock' in navigator)) return

    let disposed = false
    let sentinel: WakeLockSentinel | null = null

    const acquire = async () => {
      // 이미 잡고 있거나, 백그라운드(요청이 거부됨)면 시도하지 않는다.
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
            // 브라우저가 해제한 경우(탭 전환 등) — 화면이 보이는 동안이면 즉시 재획득.
            sentinel = null
            if (document.visibilityState === 'visible') void acquire()
          },
          { once: true },
        )
      } catch {
        // 실패는 침묵 — 배터리 세이버·권한 정책 등. 재시도는 visibilitychange 가 맡는다.
      }
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
