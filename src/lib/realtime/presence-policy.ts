/**
 * Whether a presence `sync` should trigger a snapshot refetch.
 *
 * Presence only tells you which user ids are currently connected — it says
 * nothing about a user's room membership (seat, balance, role). A `sync`
 * firing for a user id that's already a known member (e.g. a phone's wifi
 * blipping and reconnecting, or the normal join/leave churn of a 10-person
 * room) doesn't mean the room itself changed, so it shouldn't cost a
 * refetch. It genuinely might mean something when a user id shows up that
 * isn't in the member list yet — a join whose row this client hasn't
 * fetched — which is the one case worth a refetch
 * (docs/03-realtime-protocol.md: "새 참가자 입장 감지 용도").
 */
export function presenceRevealsUnknownMember(
  onlineUserIds: ReadonlySet<string>,
  knownMemberIds: ReadonlySet<string>,
): boolean {
  for (const id of onlineUserIds) {
    if (!knownMemberIds.has(id)) return true
  }
  return false
}
