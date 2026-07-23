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

/** 게임별 액션 표기 — 섯다는 섯다 용어를 쓴다. 고스톱은 베팅 자체가 없다. */
export const BET_LABELS_BY_GAME: Record<'seotda' | 'poker', Record<BetActionKind, string>> = {
  seotda: { check: '체크', call: '콜', raise: '올려', fold: '다이', allin: '올인' },
  poker: { check: '체크', call: '콜', raise: '레이즈', fold: '폴드', allin: '올인' },
}

/**
 * 레이즈 프리셋 — 직전 베팅·팟 기준 표준 콜.
 * 섯다: 삥(기본 단위)·따당(직전×2)·하프(팟 절반)·풀(팟).
 */
export function raisePresets(
  gameType: 'seotda' | 'poker',
  { lastBet, pot, base }: { lastBet: number; pot: number; base: number },
): readonly { label: string; amount: number }[] {
  const half = Math.ceil(pot / 2)
  if (gameType === 'seotda') {
    return [
      { label: '삥', amount: base },
      { label: '따당', amount: lastBet * 2 },
      { label: '하프', amount: half },
      { label: '풀', amount: pot },
    ].filter((preset) => preset.amount >= 1)
  }
  return [
    { label: '×2', amount: lastBet * 2 },
    { label: '하프', amount: half },
    { label: '팟', amount: pot },
  ].filter((preset) => preset.amount >= 1)
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
