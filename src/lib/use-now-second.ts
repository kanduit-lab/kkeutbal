'use client'

import { useSyncExternalStore } from 'react'

/**
 * 초 단위로 캐시된 현재 시각.
 *
 * `Date.now()`를 렌더 중에 직접 부르면 React Compiler 기준으로 비순수 함수 호출이고,
 * 그대로 `useSyncExternalStore`의 getSnapshot에 넣으면 호출마다 값이 달라져
 * "Maximum update depth exceeded"로 렌더 루프가 된다. 초가 바뀔 때만 새 값을 돌려주면
 * 같은 틱 안에서는 같은 스냅숏이 나오고, 규칙도 지킨다.
 *
 * 서버 렌더에서는 시각을 알 수 없으므로 null이다 — 그 상태에서는 시간에 의존하는 표시를
 * 잠시 숨기면 hydration 불일치가 없다.
 */
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | null = null
let cachedSecond = -1
let cachedValue = 0

function getSnapshot(): number {
  const second = Math.floor(Date.now() / 1000)
  if (second !== cachedSecond) {
    cachedSecond = second
    cachedValue = second * 1000
  }
  return cachedValue
}

function notify(): void {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  timer ??= setInterval(notify, 1000)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }
}

export function useNowSecond(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null)
}