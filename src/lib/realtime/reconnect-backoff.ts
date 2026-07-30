/**
 * Backoff schedule for automatic channel resubscription (`use-room-sync.ts`).
 *
 * Kept separate from that hook so the delay math and the retry-cap decision
 * can be unit tested without touching React or Supabase.
 */

export const RECONNECT_BASE_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 20_000, 30_000] as const

/**
 * After this many consecutive failed resubscribe attempts, `use-room-sync.ts`
 * stops scheduling further automatic retries. The room isn't stuck forever —
 * `visibilitychange`/`online` handlers still call `reconnect()` directly
 * (bypassing this cap), and the manual "다시 연결" button
 * (`room-connection-bar.tsx`) is always available. This cap only bounds how
 * long a backgrounded, still-online tab hammers a channel that keeps failing.
 */
export const MAX_RECONNECT_ATTEMPTS = 10

/**
 * Equal jitter (AWS "Exponential Backoff and Jitter" convention): half of
 * `baseMs` is guaranteed, the other half is randomized. Guarantees a floor
 * (unlike full jitter, which can round-trip near-instant retries) while
 * still spreading out simultaneous reconnects — e.g. a shared wifi drop
 * taking out a whole 10-person room at once.
 */
export function jitteredDelayMs(baseMs: number, random: () => number = Math.random): number {
  const half = baseMs / 2
  return Math.round(half + random() * half)
}

/** Jittered delay before resubscribe attempt number `attempt + 1` (0-based). */
export function nextReconnectDelayMs(attempt: number, random: () => number = Math.random): number {
  // Math.min clamps the index into [0, length - 1], so the lookup always hits.
  const base = RECONNECT_BASE_DELAYS_MS[Math.min(attempt, RECONNECT_BASE_DELAYS_MS.length - 1)]!
  return jitteredDelayMs(base, random)
}

/** Whether an automatic resubscribe should still be scheduled for this attempt count. */
export function shouldRetryConnect(attempt: number): boolean {
  return attempt < MAX_RECONNECT_ATTEMPTS
}
