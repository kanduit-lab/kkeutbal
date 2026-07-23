/**
 * "N시간 동안 보지 않기" 상태 저장.
 *
 * 서버에 남기지 않고 브라우저 localStorage 에만 둔다 — 비로그인 게스트도 같은 규칙으로
 * 동작하고, 닫았다는 사실 때문에 서버 왕복이 늘지 않는다. 기기를 바꾸면 다시 보이는 것은
 * 의도된 절충이다.
 *
 * 순수 함수(맵 계산)와 저장소 접근(read/write)을 나눠 둔다 — 계산 규칙만 테스트한다.
 */

const STORAGE_KEY = 'kkeutbal:promo-dismissed'

/** 프로모션 id → 다시 보여줄 시각(epoch ms). */
export type DismissMap = Readonly<Record<string, number>>

/** 만료된 항목을 버린 새 맵. 저장소가 무한히 커지지 않게 쓰기 전에 통과시킨다. */
export function pruneDismissals(map: DismissMap, now: number): DismissMap {
  const kept: Record<string, number> = {}
  for (const [id, until] of Object.entries(map)) {
    if (until > now) kept[id] = until
  }
  return kept
}

export function isDismissed(map: DismissMap, id: string, now: number): boolean {
  const until = map[id]
  return until !== undefined && until > now
}

/** 닫기 반영 — 인자 맵은 건드리지 않고 새 맵을 돌려준다. */
export function withDismissal(
  map: DismissMap,
  id: string,
  dismissHours: number,
  now: number,
): DismissMap {
  // 잘못된 시간 값이 영구 숨김이 되지 않게 최소 1시간으로 끌어올린다.
  const hours = Number.isFinite(dismissHours) && dismissHours > 0 ? dismissHours : 1
  return { ...pruneDismissals(map, now), [id]: now + hours * 60 * 60 * 1000 }
}

/** 저장된 문자열 → 맵. 형식이 깨졌으면 조용히 빈 맵으로 떨어진다. */
export function parseDismissals(raw: string | null): DismissMap {
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const valid: Record<string, number> = {}
    for (const [id, until] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof until === 'number' && Number.isFinite(until)) valid[id] = until
    }
    return valid
  } catch {
    return {}
  }
}

export function readDismissals(): DismissMap {
  if (typeof window === 'undefined') return {}
  try {
    return parseDismissals(window.localStorage.getItem(STORAGE_KEY))
  } catch (error) {
    // 사파리 프라이빗 모드 등 localStorage 접근 자체가 던지는 환경 — 노출을 막지는 않는다.
    console.error('readDismissals failed:', error)
    return {}
  }
}

export function writeDismissals(map: DismissMap): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch (error) {
    console.error('writeDismissals failed:', error)
  }
}
