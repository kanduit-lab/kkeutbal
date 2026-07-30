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
 * - `'passive'` — every current sender of this event is `room-client.tsx`'s
 *   `afterMutation`, which always also broadcasts `state.snapshot` in the
 *   same call once the actor's own mutation succeeds (see that function).
 *   So this event only drives feedback (toast/sound in
 *   `use-room-event-feedback.ts`) — the accompanying `state.snapshot` is
 *   what schedules the coalesced refetch, and letting both schedule one
 *   independently just doubles debounce-timer churn for no benefit.
 * - `'coalesced'` — no guaranteed accompanying `state.snapshot` (sent via
 *   `sendOneShotRoomEvent` from a screen with no subscribed channel — the
 *   settings page, the leave-room flow), so it must schedule its own
 *   debounced refetch, same as before this policy existed. `state.snapshot`
 *   itself is also `'coalesced'` — it drives the confirming refetch that
 *   reconciles everything its own payload doesn't cover (actions log,
 *   fairness phase, recent rounds); see `state-snapshot-hint.ts` for what it
 *   *does* let the caller paint immediately, ahead of that refetch.
 *
 * `Record<EventName, ...>` makes this exhaustive — adding a new event to
 * `eventPayloads` without adding it here fails the build instead of silently
 * defaulting to some guessed behavior.
 */
export type SyncAction = 'immediate' | 'passive' | 'coalesced'

export const SYNC_ACTION_BY_EVENT: Readonly<Record<EventName, SyncAction>> = {
  'round.started': 'immediate',
  'round.ended': 'immediate',
  'round.voided': 'immediate',
  'bet.placed': 'passive',
  'bet.approved': 'passive',
  'bet.rejected': 'passive',
  'bet.reverted': 'passive',
  'member.role_changed': 'passive',
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
