import type { z } from 'zod'
import type { ActionResult } from '@/lib/action-result'
import type { Dictionary } from '@/lib/i18n/dictionaries/ko'
import type { EventName, eventPayloads } from '@/lib/realtime/events'
import type { BetActionKind, BetActionView, RoomGameType } from '../types'

export { GAME_LABELS, GAME_BADGE_TONE } from '../labels'

export interface BroadcastSpec {
  event: EventName
  payload: z.infer<(typeof eventPayloads)[EventName]>
}

export type RunAction = <T>(
  run: () => Promise<ActionResult<T>>,
  onSuccess?: (data: T) => BroadcastSpec | void,
) => Promise<boolean>

export const VOID_REASONS = [
  { value: '재경기', labelKey: 'voidReasonRematch' },
  { value: '오입력', labelKey: 'voidReasonMisentry' },
  { value: '패 노출', labelKey: 'voidReasonExposed' },
] as const
export type VoidReason = (typeof VOID_REASONS)[number]['value']

/**
 * 무효화 다이얼로그가 겨냥한 판. `replay`는 대상 판(진행 중인 판)이 `current`와 같지만,
 * 승부가 안 난 경우(섯다 구사·무승부, 고스톱 나가리)라 다이얼로그 문구만 다르다 —
 * 딜러가 "왜 승자를 못 고르는가"를 그 자리에서 읽을 수 있어야 한다.
 */
export type VoidTarget = 'current' | 'last' | 'replay'

/**
 * 무효화 다이얼로그가 겨냥한 판의 id. `current`/`replay`는 진행 중인 판, `last`는 마지막으로
 * 끝난 판이다. 이 값은 `voidRound`에 그대로 실려 가고 서버가 스스로 고른 대상과 다르면
 * 거부된다 — 여기서 대상을 잘못 고르면 "재경기"가 방금 끝난 다른 판을 지운다.
 */
export function voidTargetRoundId(
  target: VoidTarget | null,
  ids: { readonly current?: string; readonly last?: string },
): string | undefined {
  return target === 'last' ? ids.last : ids.current
}

const VOID_REASON_VALUES: ReadonlySet<string> = new Set(VOID_REASONS.map((item) => item.value))

export function isKnownVoidReason(reason: string): reason is VoidReason {
  return VOID_REASON_VALUES.has(reason)
}

export const BET_LABELS_BY_GAME: Record<'seotda' | 'poker', Record<BetActionKind, string>> = {
  seotda: { check: '체크', call: '콜', raise: '올려', fold: '다이', allin: '올인' },
  poker: { check: '체크', call: '콜', raise: '레이즈', fold: '폴드', allin: '올인' },
}

export function betLabelsFor(
  gameType: RoomGameType,
  d?: Pick<Dictionary, 'bet'>,
): Record<BetActionKind, string> {
  const key = gameType === 'poker' ? 'poker' : 'seotda'
  return d ? d.bet[key] : BET_LABELS_BY_GAME[key]
}

export function formatChips(n: number, locale: 'ko' | 'en' = 'ko'): string {
  if (locale === 'en') return formatChipsEn(n)
  if (Math.abs(n) < 100_000) return n.toLocaleString()
  const man = n / 10_000
  return `${man.toLocaleString(undefined, { maximumFractionDigits: 1 })}만`
}

function formatChipsEn(n: number): string {
  if (Math.abs(n) < 10_000) return n.toLocaleString('en-US')
  const useMillion = Math.abs(n) >= 1_000_000
  const divisor = useMillion ? 1_000_000 : 1_000
  const value = n / divisor
  const formatted = value.toLocaleString('en-US', {
    maximumFractionDigits: 1,
    useGrouping: false,
  })
  return `${formatted}${useMillion ? 'M' : 'k'}`
}

/** 액션 종류별 뱃지 색. 지금은 펠트 좌석 카드(`game-table`)만 쓴다. */
export const ACTION_BADGE: Record<BetActionKind, string> = {
  check: 'bg-white/15 text-text',
  call: 'bg-win/25 text-win',
  raise: 'bg-warn/25 text-warn',
  fold: 'bg-white/10 text-muted',
  allin: 'bg-accent/30 text-accent',
}

export function lastAcceptedByUser(actions: readonly BetActionView[]): Map<string, BetActionView> {
  const byUser = new Map<string, BetActionView>()
  for (const action of actions) {
    if (action.status === 'accepted') byUser.set(action.userId, action)
  }
  return byUser
}

export function nonFoldedParticipantIds(
  participantIds: readonly string[],
  actions: readonly BetActionView[],
): readonly string[] {
  const lastAccepted = lastAcceptedByUser(actions)
  return participantIds.filter((userId) => lastAccepted.get(userId)?.action !== 'fold')
}

const PRESET_LABELS_FALLBACK: Dictionary['presets'] = {
  pping: '삥',
  ttadang: '따당',
  half: '하프',
  full: '풀',
  pot: '팟',
  double: '×2',
}

export function raisePresets(
  gameType: 'seotda' | 'poker',
  { lastBet, pot, base }: { lastBet: number; pot: number; base: number },
  labels: Dictionary['presets'] = PRESET_LABELS_FALLBACK,
): readonly { label: string; amount: number }[] {
  const half = Math.ceil(pot / 2)
  if (gameType === 'seotda') {
    return [
      { label: labels.pping, amount: base },
      { label: labels.ttadang, amount: lastBet * 2 },
      { label: labels.half, amount: half },
      { label: labels.full, amount: pot },
    ].filter((preset) => preset.amount >= 1)
  }
  return [
    { label: labels.double, amount: lastBet * 2 },
    { label: labels.half, amount: half },
    { label: labels.pot, amount: pot },
  ].filter((preset) => preset.amount >= 1)
}