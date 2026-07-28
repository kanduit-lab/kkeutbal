export type RoomGameType = 'seotda' | 'gostop' | 'poker'
export type RoomStatus = 'waiting' | 'playing' | 'settled' | 'closed'
export type InputMode = 'trust' | 'approval'

export type FundingMode = 'session' | 'account_credit'
export type MemberRole = 'host' | 'dealer' | 'player' | 'observer'
export type BetActionKind = 'check' | 'call' | 'raise' | 'fold' | 'allin'
export type BetStatus = 'pending' | 'accepted' | 'rejected' | 'reverted'
export type FairDealingMode = 'manual' | 'verified'

export interface FairPlayView {
  readonly dealing: FairDealingMode
  readonly seedCollectionSeconds: number
  readonly turnTimeoutSeconds: number
  readonly timeoutPolicy: 'pause'
}

export interface MemberView {
  readonly userId: string
  readonly displayName: string
  readonly avatarUrl: string | null
  readonly role: MemberRole
  readonly seatNo: number
  readonly balance: number
  readonly buyInTotal: number

  readonly joinedAt: string

  readonly isManaged: boolean
}

export interface BetActionView {
  readonly id: string
  readonly roundId: string
  readonly userId: string
  readonly enteredBy: string | null
  readonly action: BetActionKind
  readonly amount: number
  readonly status: BetStatus
  readonly reason: string | null
  readonly seq: number
  readonly createdAt: string
}

export interface RoomView {
  readonly id: string
  readonly code: string
  readonly name: string
  readonly gameType: RoomGameType
  readonly status: RoomStatus
  readonly inputMode: InputMode
  readonly startingChips: number
  readonly hostId: string

  readonly pointValue: number

  readonly baseBet: number

  readonly maxMembers: number

  readonly joinAsObserver: boolean

  readonly fundingMode: FundingMode

  readonly fairPlay: FairPlayView
}

export interface RoundView {
  readonly id: string
  readonly seq: number
  readonly pot: number

  readonly startedAt: string

  readonly fairness: FairnessRoundView | null
}

export interface FairnessRoundView {
  readonly phase: 'collecting_seeds' | 'sealed' | 'revealed' | 'aborted'
  readonly serverSeedCommitment: string
  readonly seedDeadline: string
  readonly submittedParticipantCount: number
  readonly participantCount: number

  readonly participantUserIds: readonly string[]

  readonly submittedParticipantUserIds: readonly string[]
  readonly publicReceipt: unknown | null
}

export interface LastResultView {
  readonly roundId: string
  readonly seq: number
  readonly winnerId: string | null
  readonly pot: number
  readonly note: string | null
  readonly hasFairnessAudit: boolean
}

export interface RoundPenaltyView {
  readonly userId: string
  readonly factor: 2 | 4
}

export interface RecentRoundView {
  readonly roundId: string
  readonly seq: number
  readonly winnerId: string | null
  readonly pot: number
  readonly note: string | null
  readonly status: 'ended' | 'voided'

  readonly penalties: readonly RoundPenaltyView[]
  readonly hasFairnessAudit: boolean
}

export interface RoomSnapshot {
  readonly room: RoomView
  readonly members: readonly MemberView[]
  readonly currentRound: RoundView | null

  readonly actions: readonly BetActionView[]
  readonly lastResult: LastResultView | null
  readonly endedRounds: number

  readonly recentRounds: readonly RecentRoundView[]
}