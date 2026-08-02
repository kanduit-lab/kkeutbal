import type { EventName } from './events'

/**
 * How `useRoomSync` should react to an incoming broadcast of a given event
 * name.
 *
 * - `'immediate'` — structural change (a round starting, ending, or being
 *   voided). Refetch right away, bypassing the coalescing debounce. These
 *   fire at most once per round transition — never in a rapid burst — so
 *   bypassing coalescing adds no extra load, and it closes a real staleness
 *   gap (previously a new round's data waited out the same up-to-1s debounce
 *   as everything else before appearing).
 * - `'coalesced'` — everything else: schedule a debounced refetch
 *   (`refetch-coalescer.ts`). This is the floor, not a special case —
 *   **no event may assume some other event will refetch on its behalf.**
 *   `state.snapshot` is `'coalesced'` too: it drives the confirming refetch
 *   that reconciles everything its own payload doesn't cover (actions log,
 *   fairness phase, recent rounds); see `state-snapshot-hint.ts` for what it
 *   *does* let the receiver paint immediately, ahead of that refetch.
 *
 * There used to be a third bucket, `'passive'` (feedback only, no refetch),
 * holding the events `use-room-actions.ts`'s `afterMutation` sends —
 * `bet.placed`/`approved`/`rejected`/`reverted`, `member.role_changed`. Its
 * stated justification was that `afterMutation` always also broadcasts
 * `state.snapshot` in the same call, so letting both schedule a refetch only
 * doubled debounce-timer churn. **That invariant was false.**
 * `afterMutation` guards the `state.snapshot` send with `if (result.success)`
 * where `result` is the *actor's own* refetch, itself capped at
 * `REFETCH_TIMEOUT_MS` (8s, `sync-timeouts.ts`). On a flaky link the mutation
 * commits, the actor's refetch times out, and only the bare event goes out —
 * so every other client played its toast and refetched nothing, holding a
 * stale pot until the 20s visibility-gated poll (and sizing the action bar's
 * 팟/하프 raise presets off that pot, `shared.ts`).
 *
 * Making that send unconditional was not an option: the `state.snapshot`
 * payload is built entirely from the failed refetch's data, so there is
 * nothing truthful to put in it, and broadcasting the actor's pre-mutation
 * numbers would be worse than silence — receivers paint the pot straight off
 * that hint (`state-snapshot-hint.ts`). So the bucket is gone instead. The
 * duplication it worried about is what the coalescer already exists for: an
 * event and its accompanying `state.snapshot` land in the same burst and
 * share one refetch, bounded by `MIN_EVENT_INTERVAL_MS`.
 *
 * `Record<EventName, ...>` makes this exhaustive — adding a new event to
 * `eventPayloads` without adding it here fails the build instead of silently
 * defaulting to some guessed behavior.
 */
export type SyncAction = 'immediate' | 'coalesced'

export const SYNC_ACTION_BY_EVENT: Readonly<Record<EventName, SyncAction>> = {
  'round.started': 'immediate',
  'round.ended': 'immediate',
  'round.voided': 'immediate',
  'bet.placed': 'coalesced',
  'bet.approved': 'coalesced',
  'bet.rejected': 'coalesced',
  'bet.reverted': 'coalesced',
  'member.role_changed': 'coalesced',
  'state.snapshot': 'coalesced',
  'member.left': 'coalesced',
  'room.settings_changed': 'coalesced',
  'member.joined': 'coalesced',
  'state.request': 'coalesced',
  'chips.updated': 'coalesced',
}

export function syncActionFor(name: EventName): SyncAction {
  return SYNC_ACTION_BY_EVENT[name]
}
