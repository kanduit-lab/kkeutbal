/**
 * Ordering guard for snapshot refetch responses (`use-room-sync.ts`).
 *
 * Refetches overlap constantly in a live room: a broadcast schedules one, the
 * 20s poll fires another, a mutation runs its own. Broadcast/HTTP give no
 * ordering guarantee, so a response that started earlier can land later and
 * must not repaint the screen with the older server state
 * (docs/03-realtime-protocol.md, "스냅샷 반영 규칙").
 *
 * The guard is issue-order based: `issue()` stamps a monotonically increasing
 * sequence when a refetch starts, and `accept(seq)` answers whether that
 * response is newer than whatever is already on screen. A later-issued request
 * queried a later (or equal) server state, so "highest issue sequence applied
 * so far wins" never regresses the snapshot.
 *
 * The previous inline version compared against the **last issued** sequence
 * instead of the last **applied** one (`seq !== refetchSeqRef.current`), which
 * silently starved the screen exactly when a room is busiest. With refetch
 * latency above the coalescer's `MIN_EVENT_INTERVAL_MS` (1s) — routine on
 * pension/basement wifi — a burst of betting issues a fresh refetch every
 * second while each in-flight one takes several, so every response found a
 * newer sequence already issued and was thrown away. Nothing that only the
 * refetch owns (the action log, and with it the turn indicator) updated until
 * the burst stopped: the turn moved on and nobody's phone said so. Comparing
 * against the last *applied* sequence keeps the out-of-order protection (an
 * older response is still refused) while letting the newest-so-far answer
 * through.
 */
export class SnapshotOrderGuard {
  private issued = 0
  private applied = 0

  /** Stamps a starting refetch. Pass the returned sequence to `accept`. */
  issue(): number {
    this.issued += 1
    return this.issued
  }

  /**
   * Whether the response for `seq` may replace the current snapshot. Returns
   * `false` for a response older than one already applied; a `true` answer
   * records `seq` as the newest applied.
   */
  accept(seq: number): boolean {
    if (seq <= this.applied) return false
    this.applied = seq
    return true
  }
}
