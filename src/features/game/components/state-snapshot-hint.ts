import type { z } from 'zod'
import type { eventPayloads } from '@/lib/realtime/events'
import type { RoomSnapshot } from '../types'

export type StateSnapshotPayload = z.infer<(typeof eventPayloads)['state.snapshot']>

/**
 * Merges a `state.snapshot` broadcast payload into the current snapshot for
 * instant display, without waiting for the confirming refetch that the same
 * event also schedules (`event-sync-policy.ts` classifies `state.snapshot`
 * as `'coalesced'` for exactly that refetch).
 *
 * Scope is deliberately narrow — only display numbers the payload's sender
 * already had the server compute (`refreshRoom`, called from
 * `room-client.tsx`'s `afterMutation` right before it broadcasts), never a
 * client-side calculation:
 *
 *   - member balances
 *   - the current round's pot, but ONLY when the payload's round is the
 *     exact round this client already has loaded (same `roundId`) — a
 *     different roundId means a round transition happened, which is what
 *     the `'immediate'` policy on round.started/ended/voided is for, not
 *     this partial patch.
 *
 * Deliberately NOT patched:
 *
 *   - `room.status` — flipping this from a broadcast hint could reroute the
 *     screen (settled/closed drives a redirect in `use-room-sync.ts`'s
 *     `refetch`) or gate/ungate controls from a value nobody has
 *     authenticated. The channel is public and payloads are untrusted
 *     (docs/03-realtime-protocol.md, "보안 경계"), so any status-driven
 *     side effect stays confirm-refetch-only.
 *   - anything not in the payload (actions log, fairness phase, recent
 *     rounds) — the accompanying coalesced refetch is what fills those in.
 *
 * If the payload disagrees with a *later* real refetch (broadcast delivery
 * has no ordering guarantee), the real refetch always wins — `useRoomSync`
 * replaces the whole snapshot with the server's answer on every successful
 * refetch, so any drift introduced here self-corrects within one coalesce
 * cycle. Preserves object identity when nothing actually changed, matching
 * `useRoomSync`'s "동일 내용 참조 유지" rule so a no-op hint doesn't force a
 * re-render.
 */
export function applyStateSnapshotHint(
  current: RoomSnapshot,
  payload: StateSnapshotPayload,
): RoomSnapshot {
  const balanceByUserId = new Map(payload.balances.map((entry) => [entry.userId, entry.balance]))

  let membersChanged = false
  const members = current.members.map((member) => {
    const nextBalance = balanceByUserId.get(member.userId)
    if (nextBalance === undefined || nextBalance === member.balance) return member
    membersChanged = true
    return { ...member, balance: nextBalance }
  })

  const { currentRound: prevRound } = current
  const nextRoundHint = payload.currentRound
  const currentRound =
    prevRound && nextRoundHint && nextRoundHint.roundId === prevRound.id
      ? nextRoundHint.pot !== prevRound.pot
        ? { ...prevRound, pot: nextRoundHint.pot }
        : prevRound
      : prevRound

  if (!membersChanged && currentRound === current.currentRound) return current

  return {
    ...current,
    members: membersChanged ? members : current.members,
    currentRound,
  }
}
