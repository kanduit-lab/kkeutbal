import type {
  BetActionView,
  MemberRole,
  MemberView,
  RoomGameType,
  RoomSnapshot,
} from '@/features/game/types'

/**
 * 역할별 렌더링 검증(`test/dom/game-role-rendering.test.tsx`)이 쓰는 `RoomSnapshot` 픽스처
 * 빌더. 실제 서버 스냅샷 형태(`src/features/game/types.ts`)를 그대로 따르되, 테스트에
 * 필요한 최소 필드만 조합한다.
 */
export function buildMember(overrides: {
  userId: string
  role: MemberRole
  seatNo?: number
  displayName?: string
  balance?: number
  buyInTotal?: number
  isManaged?: boolean
}): MemberView {
  return {
    userId: overrides.userId,
    displayName: overrides.displayName ?? overrides.userId,
    avatarUrl: null,
    role: overrides.role,
    seatNo: overrides.seatNo ?? 0,
    balance: overrides.balance ?? 10_000,
    buyInTotal: overrides.buyInTotal ?? 10_000,
    joinedAt: '2026-07-30T00:00:00.000Z',
    isManaged: overrides.isManaged ?? false,
  }
}

/**
 * 방장·딜러·플레이어·관전자가 모두 있는 표준 테이블. 역할별 렌더링 검증은 이 4명 중
 * 하나를 `self`로 골라 돌린다 — 나머지 3명은 "같은 방을 보는 다른 사람들" 맥락을 준다.
 */
export function buildStandardTable(): readonly MemberView[] {
  return [
    buildMember({ userId: 'host-1', role: 'host', seatNo: 0 }),
    buildMember({ userId: 'dealer-1', role: 'dealer', seatNo: 1 }),
    buildMember({ userId: 'player-1', role: 'player', seatNo: 2 }),
    buildMember({ userId: 'observer-1', role: 'observer', seatNo: 3 }),
  ]
}

export function findByRole(members: readonly MemberView[], role: MemberRole): MemberView {
  const member = members.find((m) => m.role === role)
  if (!member) throw new Error(`fixture missing role: ${role}`)
  return member
}

export function buildBetAction(
  overrides: Partial<BetActionView> & Pick<BetActionView, 'userId' | 'action' | 'seq'>,
): BetActionView {
  return {
    id: `action-${overrides.seq}`,
    roundId: 'round-1',
    enteredBy: null,
    amount: 0,
    status: 'accepted',
    reason: null,
    createdAt: '2026-07-30T00:00:00.000Z',
    ...overrides,
  }
}

export function buildRoomSnapshot({
  gameType,
  members,
  hasRound = true,
  actions = [],
  status = 'playing',
}: {
  gameType: RoomGameType
  members: readonly MemberView[]
  hasRound?: boolean
  actions?: readonly BetActionView[]
  status?: RoomSnapshot['room']['status']
}): RoomSnapshot {
  const host = members.find((m) => m.role === 'host') ?? members[0]!
  return {
    room: {
      id: 'room-1',
      code: 'ABCDEF',
      name: '테스트 방',
      gameType,
      status,
      inputMode: 'trust',
      startingChips: 10_000,
      hostId: host.userId,
      pointValue: 1_000,
      baseBet: 100,
      maxMembers: 8,
      joinAsObserver: true,
      fundingMode: 'session',
      fairPlay: {
        dealing: 'manual',
        seedCollectionSeconds: 30,
        turnTimeoutSeconds: 30,
        timeoutPolicy: 'pause',
      },
    },
    members,
    currentRound: hasRound
      ? { id: 'round-1', seq: 1, pot: 300, startedAt: '2026-07-30T00:00:00.000Z', fairness: null }
      : null,
    actions,
    lastResult: null,
    endedRounds: 0,
    recentRounds: [],
  }
}
