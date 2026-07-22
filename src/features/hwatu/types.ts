/** 화투 카드 모델 — 섯다·고스톱 공통 기반. */

export type Month = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12

/** 광 · 열끗 · 띠 · 피 */
export type CardKind = 'gwang' | 'yeol' | 'tti' | 'pi'

/**
 * 띠의 종류. `null` 은 어떤 단(홍/청/초)에도 속하지 않는 띠(12월 비띠)를 뜻한다.
 * `kind !== 'tti'` 인 카드는 항상 `null`.
 */
export type TtiKind = 'hong' | 'cheong' | 'cho' | null

export interface HwatuCard {
  /** 안정 식별자. UI 선택 상태 · vision 인식 결과 · DB jsonb 가 모두 이 키를 쓴다. */
  readonly id: string
  readonly month: Month
  readonly kind: CardKind
  readonly tti: TtiKind
  /** 피 환산값. 쌍피 = 2, 일반 피 = 1, 피가 아니면 0. */
  readonly piValue: 0 | 1 | 2
  /** 고도리 대상 (2·4·8월 새). */
  readonly isGodori: boolean
  /** 섯다 20장 덱 포함 여부 (1~10월 비(非)피 카드). */
  readonly seotda: boolean
  /** 표시용 한국어 이름. */
  readonly label: string
}

export type CardId = HwatuCard['id']

export type GameType = 'seotda' | 'gostop'
