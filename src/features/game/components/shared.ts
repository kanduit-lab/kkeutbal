import type { z } from 'zod'
import type { ActionResult } from '@/lib/action-result'
import type { EventName, eventPayloads } from '@/lib/realtime/events'
import type { BetActionKind, RoomGameType } from '../types'

/** 액션 성공 후 피어에게 쏠 이벤트. */
export interface BroadcastSpec {
  event: EventName
  payload: z.infer<(typeof eventPayloads)[EventName]>
}

/**
 * Server Action 실행 공통 경로 — 실패 토스트, 성공 시 refetch + 브로드캐스트.
 * room-client 가 구현을 소유한다.
 */
export type RunAction = <T>(
  run: () => Promise<ActionResult<T>>,
  onSuccess?: (data: T) => BroadcastSpec | void,
) => Promise<boolean>

export const BET_LABELS: Record<BetActionKind, string> = {
  check: '체크',
  call: '콜',
  raise: '레이즈',
  fold: '다이',
  allin: '올인',
}

export const GAME_LABELS: Record<RoomGameType, { name: string; emoji: string }> = {
  seotda: { name: '섯다', emoji: '🎴' },
  gostop: { name: '고스톱', emoji: '🌸' },
  poker: { name: '포커', emoji: '♠' },
}

export const GAME_BADGE_TONE: Record<RoomGameType, 'accent' | 'win' | 'warn'> = {
  seotda: 'accent',
  gostop: 'win',
  poker: 'warn',
}

/** 딜러 승자 확정 메모 입력창 placeholder — 게임마다 예시가 다르다. */
export const WINNER_NOTE_PLACEHOLDER: Record<RoomGameType, string> = {
  seotda: '예: 38광땡',
  gostop: '예: 3점 스톱',
  poker: '예: 풀하우스',
}
