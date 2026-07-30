/**
 * Bounded memory of recently-seen realtime envelope ids, used to skip
 * duplicate feedback (toast/sound) when a reconnect replays an event the
 * client already reacted to. Snapshot refetch is never gated by this —
 * only the "did we already show a toast for this id" decision is.
 */

export const SEEN_EVENT_ID_CAP = 200

export class SeenEventIds {
  private readonly order: string[] = []
  private readonly seen = new Set<string>()

  constructor(private readonly cap: number = SEEN_EVENT_ID_CAP) {}

  /**
   * Records `id` as seen. Returns `true` the first time an id is recorded,
   * `false` on every subsequent call with the same id (until it's evicted).
   */
  record(id: string): boolean {
    if (this.seen.has(id)) return false

    this.seen.add(id)
    this.order.push(id)
    if (this.order.length > this.cap) {
      const oldest = this.order.shift()
      if (oldest !== undefined) this.seen.delete(oldest)
    }
    return true
  }

  get size(): number {
    return this.seen.size
  }
}
