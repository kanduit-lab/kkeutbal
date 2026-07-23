/**
 * 방 상태 뷰 타입. 클라이언트가 import 하므로 DB 스키마를 여기로 새지 않게 한다.
 * 진실은 서버 스냅샷(getRoomSnapshot)이고, 실시간 이벤트는 갱신 힌트다.
 */

export type RoomGameType = 'seotda' | 'gostop' | 'poker'
export type RoomStatus = 'waiting' | 'playing' | 'settled' | 'closed'
export type InputMode = 'trust' | 'approval'
export type MemberRole = 'host' | 'dealer' | 'player' | 'observer'
export type BetActionKind = 'check' | 'call' | 'raise' | 'fold' | 'allin'
export type BetStatus = 'pending' | 'accepted' | 'rejected' | 'reverted'

export interface MemberView {
  readonly userId: string
  readonly displayName: string
  readonly avatarUrl: string | null
  readonly role: MemberRole
  readonly seatNo: number
  readonly balance: number
  readonly buyInTotal: number
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
}

export interface RoundView {
  readonly id: string
  readonly seq: number
  readonly pot: number
}

export interface LastResultView {
  readonly seq: number
  readonly winnerId: string | null
  readonly pot: number
  readonly note: string | null
}

export interface RoomSnapshot {
  readonly room: RoomView
  readonly members: readonly MemberView[]
  readonly currentRound: RoundView | null
  /** 현재 판의 액션 전체 (모든 상태, seq 오름차순). */
  readonly actions: readonly BetActionView[]
  readonly lastResult: LastResultView | null
  readonly endedRounds: number
}
