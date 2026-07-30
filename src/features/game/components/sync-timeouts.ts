/**
 * Timeout ceilings shared between the room's read-only snapshot refetch
 * (`use-room-sync.ts`, runs on every poll/broadcast hint) and its mutation
 * race (`runAction` in `room-client.tsx`, write path).
 *
 * `REFETCH_TIMEOUT_MS` is kept below `ACTION_RACE_TIMEOUT_MS` on purpose: a
 * stalled read should never be allowed to run as long as a mutation that may
 * still be legitimately in flight on the server (advisory lock contention,
 * slower write path). Keep both constants here so the two files can't drift
 * out of that ordering silently.
 */

export const REFETCH_TIMEOUT_MS = 8_000

export const ACTION_RACE_TIMEOUT_MS = 15_000
