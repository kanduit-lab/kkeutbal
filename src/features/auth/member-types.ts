/**
 * 회원 관리가 주고받는 타입. `member-actions.ts`는 `'use server'` 파일이라 값 export가
 * 전부 클라이언트 호출 엔드포인트로 취급된다 — 타입도 그쪽에 두면 경계가 헷갈리므로
 * 여기로 뺀다(같은 이유의 선례는 `schemas.ts`).
 */

export type MemberStatus = 'active' | 'suspended' | 'deleted'
export type MemberAuthType = 'internal' | 'sso' | 'guest'

export interface MemberCreditEntry {
  readonly id: string
  readonly kind: 'admin_grant' | 'admin_revoke' | 'room_lock' | 'room_settlement' | 'correction'
  readonly reason: string
  readonly deltaAvailable: number
  readonly deltaLocked: number
  readonly availableAfter: number
  readonly createdAt: string
}

export interface MemberDetail {
  readonly id: string
  readonly displayName: string
  readonly username: string | null
  readonly phoneMasked: string | null
  readonly isAdmin: boolean
  readonly isGuest: boolean
  readonly isManaged: boolean
  readonly hasPassword: boolean
  readonly authType: MemberAuthType
  readonly status: MemberStatus
  readonly statusReason: string | null
  readonly statusChangedAt: string | null
  readonly statusChangedByName: string | null
  readonly createdAt: string

  readonly availableBalance: number
  readonly lockedBalance: number

  readonly roomsJoined: number
  readonly roomsActive: number
  readonly roomsHosted: number
  readonly transactions: readonly MemberCreditEntry[]
}

export interface MemberBulkFailure {
  readonly userId: string
  readonly error: string
}

export interface MemberBulkResult {
  readonly changed: readonly string[]
  readonly failed: readonly MemberBulkFailure[]
}
