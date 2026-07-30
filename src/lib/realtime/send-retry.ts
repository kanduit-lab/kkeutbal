/**
 * Retry schedule for a single broadcast send (`client.ts`'s `sendWithRetry`).
 *
 * Deliberately short: a failed `channel.send()` almost always means the
 * channel wasn't joined at that instant (socket mid-reconnect) and supabase-js
 * fell back to a one-shot REST POST, or that REST POST itself hit a transient
 * error. Either way this is a bounce, not a sustained outage — a long backoff
 * here would just make an already-recovering connection look slower than the
 * 20s poll fallback it's trying to beat.
 */

export const MAX_SEND_ATTEMPTS = 3

const SEND_RETRY_DELAYS_MS = [300, 800] as const

/** Delay before retry attempt number `attemptIndex + 1` (0-based, i.e. the 2nd/3rd try). */
export function sendRetryDelayMs(attemptIndex: number): number {
  // Math.min clamps the index into [0, length - 1], so the lookup always hits.
  return SEND_RETRY_DELAYS_MS[Math.min(attemptIndex, SEND_RETRY_DELAYS_MS.length - 1)]!
}
