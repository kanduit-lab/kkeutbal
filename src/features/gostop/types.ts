import type { HwatuCard } from '../hwatu/types'

/**
 * 고스톱 점수 타입 · 룰 프리셋.
 * 규칙 근거는 docs/04-game-engines.md "고스톱 엔진" 절.
 */

/** 획득 패를 분류별로 집계한 중간 산출물. */
export interface GostopCapture {
  readonly gwang: readonly HwatuCard[]
  readonly yeol: readonly HwatuCard[]
  readonly tti: readonly HwatuCard[]
  readonly pi: readonly HwatuCard[]
  /** 피 환산 합계 (쌍피 = 2). */
  readonly piValue: number
}

export interface GostopScoreLine {
  /** 예: '광3', '고도리', '홍단', '피11' */
  readonly source: string
  readonly points: number
}

export interface GostopMultiplier {
  /** 예: '3고', '피박', '광박', '흔들기' */
  readonly source: string
  readonly factor: number
}

export interface GostopScore {
  readonly breakdown: readonly GostopScoreLine[]
  readonly base: number
  readonly multipliers: readonly GostopMultiplier[]
  readonly total: number
  /** `base >= rules.baseWinScore` — 스톱 선언 가능 여부 */
  readonly canStop: boolean
}

/**
 * 지역 룰 편차를 담는 프리셋. 엔진은 이 값을 직접 알지 않고 인자로 받는다.
 * 방 생성 시 선택되어 `rooms.rule_preset` jsonb 로 저장된다 (docs/02-data-model.md).
 */
export interface GostopRules {
  /** 1고·2고 가산점. 인덱스 0 = 1고. */
  readonly goBonusFlat: readonly number[]
  /** 이 고 수부터 배수를 적용한다 (보통 3). */
  readonly goMultiplierFrom: number
  /** 비광을 3광 계산에 포함할지. false 면 비광 포함 3광은 2점. */
  readonly bipiCountsAsGwang: boolean
  readonly piBak: boolean
  readonly gwangBak: boolean
  readonly meongBak: boolean
  readonly chongtongInstantWin: boolean
  readonly shakeMultiplier: number
  readonly bombMultiplier: number
  /** 나기 최소 점수. */
  readonly baseWinScore: number
  /** 9월 국진(술잔)을 쌍피로 쓸 수 있는지. */
  readonly gukjinAsSsangpi: boolean
}

export const GOSTOP_RULES_STANDARD: GostopRules = Object.freeze({
  goBonusFlat: Object.freeze([1, 2]),
  goMultiplierFrom: 3,
  bipiCountsAsGwang: false,
  piBak: true,
  gwangBak: true,
  meongBak: false,
  chongtongInstantWin: true,
  shakeMultiplier: 2,
  bombMultiplier: 2,
  baseWinScore: 3,
  gukjinAsSsangpi: true,
})

/** 점수 계산에 필요한 판 상황. 획득 패만으로는 배수를 계산할 수 없다. */
export interface GostopContext {
  readonly goCount: number
  readonly shakeCount: number
  readonly bombCount: number
  /** 상대(패자)들의 집계 — 피박·광박 판정에 필요 */
  readonly opponents: readonly GostopCapture[]
}
