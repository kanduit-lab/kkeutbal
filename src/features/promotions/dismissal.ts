const STORAGE_KEY = 'kkeutbal:promo-dismissed'

export type DismissMap = Readonly<Record<string, number>>

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

export function withDismissal(
  map: DismissMap,
  id: string,
  dismissHours: number,
  now: number,
): DismissMap {
  const hours = Number.isFinite(dismissHours) && dismissHours > 0 ? dismissHours : 1
  return { ...pruneDismissals(map, now), [id]: now + hours * 60 * 60 * 1000 }
}

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