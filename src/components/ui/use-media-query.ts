'use client'

import { useCallback, useSyncExternalStore } from 'react'

export const DESKTOP_QUERY = '(min-width: 1024px)'

/** 서버 렌더에서는 항상 false. 데스크톱 전용 레이아웃 분기에만 쓴다. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const media = window.matchMedia(query)
      media.addEventListener('change', onStoreChange)
      return () => media.removeEventListener('change', onStoreChange)
    },
    [query],
  )
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query])
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}

export function useIsDesktop(): boolean {
  return useMediaQuery(DESKTOP_QUERY)
}
