/**
 * Coalescing policy for event-driven snapshot refetches (`use-room-sync.ts`).
 *
 * Two constants, unchanged from the original implementation — this module
 * only fixes how they combine (docs/03-realtime-protocol.md documents the
 * externally-visible numbers; keep it in sync if this file's constants
 * change):
 *
 * - `EVENT_DEBOUNCE_MS` (250ms): trailing debounce — wait for a quiet gap
 *   after the last event before firing.
 * - `MIN_EVENT_INTERVAL_MS` (1000ms): rate limit — never run two
 *   event-triggered refetches less than this apart.
 *
 * The original inline calculation (`Math.max(EVENT_DEBOUNCE_MS,
 * MIN_EVENT_INTERVAL_MS - sinceLastRefetch)`) rate-limited correctly once a
 * refetch had already run, but had no ceiling on the *first* wait of a
 * burst. Under a continuous stream of events arriving faster than every
 * 250ms (e.g. 10 people betting inside the same second), the pending timer
 * keeps getting cleared and rescheduled at the 250ms floor and can starve
 * indefinitely — never actually firing while events keep arriving.
 *
 * This adds a `maxWait`-style cap (the standard debounce-with-maxWait
 * pattern, e.g. lodash's `maxWait` option), reusing `MIN_EVENT_INTERVAL_MS`
 * as that cap instead of introducing a new number — it's the same "at least
 * once a second" guarantee the original rate limit already implied once a
 * refetch had run; this just makes it hold from the very first event of a
 * burst too, instead of only kicking in after the first refetch completes.
 */

export const EVENT_DEBOUNCE_MS = 250

export const MIN_EVENT_INTERVAL_MS = 1_000

export interface CoalescerState {
  /** epoch ms the last coalesced refetch actually ran, or 0 if none has run yet. */
  readonly lastRefetchAt: number
  /** epoch ms the current burst of events started, or null while idle. */
  readonly burstStartedAt: number | null
}

export const INITIAL_COALESCER_STATE: CoalescerState = {
  lastRefetchAt: 0,
  burstStartedAt: null,
}

/**
 * Given the coalescer's current state and the time an event arrived, returns
 * how many ms to wait before the next refetch should fire, plus the state to
 * carry forward. Call this on every coalesced event; the caller is
 * responsible for actually (re)scheduling a timer for `delayMs` and for
 * calling `noteCoalescedRefetchRan` when that timer fires.
 */
export function noteCoalescedEvent(
  state: CoalescerState,
  now: number,
): { delayMs: number; state: CoalescerState } {
  const burstStartedAt = state.burstStartedAt ?? now

  const sinceLastRefetch = now - state.lastRefetchAt
  const rateLimitDelay = MIN_EVENT_INTERVAL_MS - sinceLastRefetch
  const naiveDelay = Math.max(EVENT_DEBOUNCE_MS, rateLimitDelay)

  const burstElapsed = now - burstStartedAt
  const maxWaitRemaining = MIN_EVENT_INTERVAL_MS - burstElapsed

  const delayMs = Math.max(0, Math.min(naiveDelay, maxWaitRemaining))

  return { delayMs, state: { ...state, burstStartedAt } }
}

/**
 * Call once the scheduled refetch actually runs. Resets both the rate-limit
 * clock and the burst tracker so the next event starts a fresh cycle.
 */
export function noteCoalescedRefetchRan(now: number): CoalescerState {
  return { lastRefetchAt: now, burstStartedAt: null }
}
