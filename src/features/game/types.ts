/**
 * 방 상태 뷰 타입. 클라이언트가 import 하므로 DB 스키마를 여기로 새지 않게 한다.
 * 진실은 서버 스냅샷(getRoomSnapshot)이고, 실시간 이벤트는 갱신 힌트다.
 */

export type RoomGameType = 'seotda' | 'gostop' | 'poker'
export type RoomStatus = 'waiting' | 'playing' | 'settled' | 'closed'
export type InputMode = 'trust' | 'approval'
/** 세션 칩의 재원. account_credit은 전역 지갑 lock과 함께만 바이인한다. */
export type FundingMode = 'session' | 'account_credit'
export type MemberRole = 'host' | 'dealer' | 'player' | 'observer'
export type BetActionKind = 'check' | 'call' | 'raise' | 'fold' | 'allin'
export type BetStatus = 'pending' | 'accepted' | 'rejected' | 'reverted'
export type FairDealingMode = 'manual' | 'verified'

/** Immutable after the first round; verified currently denotes authoritative Seotda commit-reveal. */
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
  /** 입장 시각 (ISO 8601). */
  readonly joinedAt: string
  /**
   * 호스트가 이름만으로 만든 대리 기록용 좌석. 본인 화면이 없으므로 온라인 표시를 하지 않고
   * 모든 조작은 딜러의 대리 입력으로만 이뤄진다.
   */
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
  /** 고스톱 점당 칩. 고스톱 외 게임은 사용하지 않는다. */
  readonly pointValue: number
  /** 베팅 기본 단위(삥). rulePreset 미지정 시 시작 칩의 1%. */
  readonly baseBet: number
  /** 최대 인원(2~10). rulePreset 미지정 시 10. */
  readonly maxMembers: number
  /** true 면 새 참가자가 관전자로 입장(시작 칩 미지급). */
  readonly joinAsObserver: boolean
  /** 기존 방은 안전하게 session으로 해석한다. */
  readonly fundingMode: FundingMode
  /** Legacy or malformed presets safely resolve to manual/pause defaults. */
  readonly fairPlay: FairPlayView
}

export interface RoundView {
  readonly id: string
  readonly seq: number
  readonly pot: number
  /** 판 시작 시각 (ISO 8601). */
  readonly startedAt: string
  /** 공개 가능한 commitment·진행 단계만 포함한다. server/client 원문 seed와 손패는 절대 없다. */
  readonly fairness: FairnessRoundView | null
}

export interface FairnessRoundView {
  readonly phase: 'collecting_seeds' | 'sealed' | 'revealed' | 'aborted'
  readonly serverSeedCommitment: string
  readonly seedDeadline: string
  readonly submittedParticipantCount: number
  readonly participantCount: number
  /** Seat snapshot participant IDs; current joiners must not be offered a seed/hand control. */
  readonly participantUserIds: readonly string[]
  /** Seed values remain private; this only lets a participant recover the submitted UI state. */
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

/**
 * 고스톱 패자 박(피박/광박) 배수 기록. 딜러 UI 는 최종 배수(factor)만 서버로 보내고
 * 어떤 박인지(피박/광박/둘 다)는 구분해 전달하지 않으므로, 여기서도 factor 만 안다.
 */
export interface RoundPenaltyView {
  readonly userId: string
  readonly factor: 2 | 4
}

/** 최근 종료·무효 판 요약. 방 화면의 판 히스토리 미리보기용. */
export interface RecentRoundView {
  readonly roundId: string
  readonly seq: number
  readonly winnerId: string | null
  readonly pot: number
  readonly note: string | null
  readonly status: 'ended' | 'voided'
  /** 고스톱 박 적용 패자 목록(factor>1 만). 고스톱 외 게임·구버전 판은 빈 배열. */
  readonly penalties: readonly RoundPenaltyView[]
  readonly hasFairnessAudit: boolean
}

export interface RoomSnapshot {
  readonly room: RoomView
  readonly members: readonly MemberView[]
  readonly currentRound: RoundView | null
  /** 현재 판의 액션 전체 (모든 상태, seq 오름차순). */
  readonly actions: readonly BetActionView[]
  readonly lastResult: LastResultView | null
  readonly endedRounds: number
  /** 최근 종료·무효 판 최대 5개 (seq 내림차순). */
  readonly recentRounds: readonly RecentRoundView[]
}
