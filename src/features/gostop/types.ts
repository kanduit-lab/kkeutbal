import type { HwatuCard } from '../hwatu/types'

export interface GostopCapture {
  readonly gwang: readonly HwatuCard[]
  readonly yeol: readonly HwatuCard[]
  readonly tti: readonly HwatuCard[]
  readonly pi: readonly HwatuCard[]

  readonly piValue: number
}

export interface GostopScoreLine {
  readonly source: string
  readonly points: number
}

export interface GostopMultiplier {
  readonly source: string
  readonly factor: number
}

export interface GostopScore {
  readonly breakdown: readonly GostopScoreLine[]
  readonly base: number
  readonly multipliers: readonly GostopMultiplier[]
  readonly total: number

  readonly canStop: boolean
}

export interface GostopRules {
  readonly goBonusFlat: readonly number[]

  readonly goMultiplierFrom: number

  readonly bipiCountsAsGwang: boolean
  readonly piBak: boolean
  readonly gwangBak: boolean
  readonly meongBak: boolean
  readonly chongtongInstantWin: boolean
  readonly shakeMultiplier: number
  readonly bombMultiplier: number

  readonly baseWinScore: number

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

export interface GostopContext {
  readonly goCount: number
  readonly shakeCount: number
  readonly bombCount: number

  readonly opponents: readonly GostopCapture[]
}