import type { z } from 'zod'
import type { ActionResult } from '@/lib/action-result'
import type { Dictionary } from '@/lib/i18n/dictionaries/ko'
import type { EventName, eventPayloads } from '@/lib/realtime/events'
import type { BetActionKind, BetActionView, RoomGameType } from '../types'

/** 재수출 — 정본은 `../labels` (feature 공개 표면). 기존 내부 호출부(components/**) 호환용. */
export { GAME_LABELS, GAME_BADGE_TONE } from '../labels'

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

/** 게임별 액션 표기 — 섯다는 섯다 용어를 쓴다. 고스톱은 베팅 자체가 없다. */
export const BET_LABELS_BY_GAME: Record<'seotda' | 'poker', Record<BetActionKind, string>> = {
  seotda: { check: '체크', call: '콜', raise: '올려', fold: '다이', allin: '올인' },
  poker: { check: '체크', call: '콜', raise: '레이즈', fold: '폴드', allin: '올인' },
}

/**
 * 게임별 베팅 라벨 결정 — 방 gameType 을 그대로 받아 분기를 한곳에 모은다.
 * 고스톱은 베팅 UI 가 없지만 로그·과거 기록 표기용으로 섯다 라벨로 폴백한다.
 * 사전(d)을 넘기면 로케일 라벨(d.bet)을 쓰고, 없으면 한국어 상수로 폴백한다.
 */
export function betLabelsFor(
  gameType: RoomGameType,
  d?: Pick<Dictionary, 'bet'>,
): Record<BetActionKind, string> {
  const key = gameType === 'poker' ? 'poker' : 'seotda'
  return d ? d.bet[key] : BET_LABELS_BY_GAME[key]
}

/**
 * 칩 금액 표기 — 판 옆 작은 화면에서 자릿수를 줄이려고 축약한다. 로케일별로 단위가 다르다.
 * ko(기본값): 10만(100,000) 이상은 만 단위. 예: 125000 → '12.5만', 10000000 → '1,000만', 99999 → '99,999'
 * en: 1만(10,000) 이상은 k/M 단위. 예: 10000 → '10k', 12500 → '12.5k', 1000000 → '1M', 9999 → '9,999'
 * 두 로케일 모두 축약 임계값 미만은 천 단위 구분자가 있는 평문 숫자를 쓴다.
 */
export function formatChips(n: number, locale: 'ko' | 'en' = 'ko'): string {
  if (locale === 'en') return formatChipsEn(n)
  if (Math.abs(n) < 100_000) return n.toLocaleString()
  const man = n / 10_000
  return `${man.toLocaleString(undefined, { maximumFractionDigits: 1 })}만`
}

/** en 로케일 축약 — 100만 이상은 M, 1만 이상은 k. 소수 1자리까지만, 불필요한 .0 은 Intl 이 알아서 생략한다. */
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

/**
 * 유저별 마지막 확정(accepted) 액션 — 다이·올인 상태 게이팅의 기준.
 * snapshot.actions 는 seq 오름차순이므로 순회하며 덮어쓰면 마지막 확정 액션이 남는다.
 */
export function lastAcceptedByUser(actions: readonly BetActionView[]): Map<string, BetActionView> {
  // 로컬 accumulator — 함수 밖으로 새지 않음
  const byUser = new Map<string, BetActionView>()
  for (const action of actions) {
    if (action.status === 'accepted') byUser.set(action.userId, action)
  }
  return byUser
}

/**
 * 승자 후보에서 다이/폴드한 참가자를 뺀다.
 *
 * 서버도 `endRound`에서 같은 불변식을 검사한다. 이 함수는 현재 스냅샷을 바탕으로 딜러가
 * 잘못된 대상을 고르지 않게 하는 표시용 파생값이다. 정정(revert)된 액션은 accepted가 아니므로
 * 자연히 후보를 다시 살린다.
 */
export function nonFoldedParticipantIds(
  participantIds: readonly string[],
  actions: readonly BetActionView[],
): readonly string[] {
  const lastAccepted = lastAcceptedByUser(actions)
  return participantIds.filter((userId) => lastAccepted.get(userId)?.action !== 'fold')
}

/** 레이즈 프리셋 라벨 폴백 — 사전 없이 호출되는 경로에서 쓰는 한국어 상수. */
const PRESET_LABELS_FALLBACK: Dictionary['presets'] = {
  pping: '삥',
  ttadang: '따당',
  half: '하프',
  full: '풀',
  pot: '팟',
  double: '×2',
}

/**
 * 레이즈 프리셋 — 직전 베팅·팟 기준 표준 콜.
 * 섯다: 삥(기본 단위)·따당(직전×2)·하프(팟 절반)·풀(팟).
 * labels 에 사전의 d.presets 를 넘기면 로케일 라벨을 쓴다.
 */
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
