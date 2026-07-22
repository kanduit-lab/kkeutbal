import type { HwatuCard, Month } from '../hwatu/types'
import type {
  GostopCapture,
  GostopContext,
  GostopMultiplier,
  GostopRules,
  GostopScore,
  GostopScoreLine,
} from './types'

/**
 * 고스톱 점수 엔진. 순수 함수만 둔다 — I/O · DB · 시간 · 난수 금지.
 *
 * 계산 순서:
 *   분류 집계 → 기본 점수 → 조합 보너스 → 고 가산·배수 → 박 배수 → 선언 배수 → 총점
 *
 * `breakdown` 을 반드시 채운다. 고스톱 분쟁의 대부분은 "왜 그 점수냐"이고,
 * 총점만 주면 앱이 심판 역할을 못 한다.
 *
 * 계약 정리:
 * - `base` = 카드에서 나온 점수(기본 + 조합 보너스)만. 고 가산은 제외 —
 *   `canStop` 은 "카드 점수로 나기 최소점을 넘었는가"라서 고 가산이 섞이면 오염된다.
 * - `breakdown` 합 × `multipliers` 곱 = `total`. 고 가산은 breakdown 라인으로 들어간다.
 * - `chongtongInstantWin` 은 판 흐름(즉시 승리) 소관이라 점수 함수가 소비하지 않는다.
 *   이 모듈은 `hasChongtong` 으로 감지만 제공한다.
 */

/** 9월 국화 국진(술잔). 룰에 따라 쌍피로 전환 가능. */
const GUKJIN_ID = '09-yeol'
/** 12월 비광. `bipiCountsAsGwang` 토글 대상. */
const BIGWANG_ID = '12-gwang'

const GWANG_MIN = 3
const YEOL_MIN = 5
const TTI_MIN = 5
const PI_MIN = 10
const DAN_SIZE = 3
const GODORI_SIZE = 3
/** 피박 기준 — 패자 피 환산 5장 이하. */
const PIBAK_MAX_PI = 5
/** 국진을 피로 쓸 때의 환산값 (쌍피). */
const GUKJIN_PI_VALUE = 2

/**
 * 획득 카드를 분류별로 집계한다.
 *
 * `gukjinAsSsangpi` 가 켜져 있고 국진을 획득했으면, 열끗/쌍피 두 갈래의 기본 점수를
 * 비교해 높은 쪽으로 배치한다. 동점이면 쌍피 — 피 환산이 높을수록 피박 방어에 유리하다.
 * (실제 플레이에서는 플레이어가 선택하지만, 이 함수는 판 상황을 모르므로
 * 기본 점수 최대화를 결정 규칙으로 삼는다. 명시 선택이 필요해지면 상태머신에서 확장.)
 */
export function captureOf(cards: readonly HwatuCard[], rules: GostopRules): GostopCapture {
  const asYeol = classify(cards, false)
  if (!rules.gukjinAsSsangpi || !cards.some((card) => card.id === GUKJIN_ID)) {
    return asYeol
  }

  const asPi = classify(cards, true)
  const yeolScore = sumPoints(baseLines(asYeol, rules))
  const piScore = sumPoints(baseLines(asPi, rules))
  return piScore >= yeolScore ? asPi : asYeol
}

/**
 * 집계 + 판 상황으로 최종 점수를 계산한다.
 *
 * `capture` 와 `context.opponents` 는 반드시 `captureOf` 로 만든 값이어야 한다 —
 * 국진 쌍피 토글이 거기서 소비되기 때문이다.
 */
export function scoreGostop(
  capture: GostopCapture,
  context: GostopContext,
  rules: GostopRules,
): GostopScore {
  const cardLines = baseLines(capture, rules)
  const base = sumPoints(cardLines)

  const goLine = goBonusLine(context.goCount, rules)
  const breakdown = goLine === null ? cardLines : [...cardLines, goLine]

  // 배수 순서 = 파이프라인 순서: 고 배수 → 박 배수 → 선언 배수
  const multipliers: GostopMultiplier[] = []
  const goMul = goMultiplier(context.goCount, rules)
  if (goMul !== null) multipliers.push(goMul)
  multipliers.push(...bakMultipliers(capture, context, rules))
  multipliers.push(...declarationMultipliers(context, rules))

  const additive = base + (goLine?.points ?? 0)
  const factor = multipliers.reduce((acc, mul) => acc * mul.factor, 1)

  return {
    breakdown,
    base,
    multipliers,
    total: additive * factor,
    canStop: base >= rules.baseWinScore,
  }
}

/** 같은 월 4장 보유 여부 (총통). 손패 기준 판정 — 즉시 승리 처리는 게임 상태머신 소관. */
export function hasChongtong(cards: readonly HwatuCard[]): boolean {
  const counts = new Map<Month, number>()
  for (const card of cards) {
    const next = (counts.get(card.month) ?? 0) + 1
    if (next >= 4) return true
    counts.set(card.month, next)
  }
  return false
}

// ── 내부 헬퍼 ──────────────────────────────────────────────────────────

/** kind 기준 분류. `gukjinAsPi` 면 국진을 쌍피로 취급한다. */
function classify(cards: readonly HwatuCard[], gukjinAsPi: boolean): GostopCapture {
  // 로컬 accumulator — 함수 밖으로 새지 않으므로 push 허용 (coding-style 예외 규정)
  const gwang: HwatuCard[] = []
  const yeol: HwatuCard[] = []
  const tti: HwatuCard[] = []
  const pi: HwatuCard[] = []
  let piValue = 0

  for (const card of cards) {
    if (gukjinAsPi && card.id === GUKJIN_ID) {
      pi.push(card)
      piValue += GUKJIN_PI_VALUE
      continue
    }
    switch (card.kind) {
      case 'gwang':
        gwang.push(card)
        break
      case 'yeol':
        yeol.push(card)
        break
      case 'tti':
        tti.push(card)
        break
      case 'pi':
        pi.push(card)
        piValue += card.piValue
        break
    }
  }

  return { gwang, yeol, tti, pi, piValue }
}

/** 기본 점수 + 조합 보너스 라인. 광 → 열끗 → 띠 → 피 → 고도리 → 단 순서로 채운다. */
function baseLines(capture: GostopCapture, rules: GostopRules): readonly GostopScoreLine[] {
  const lines: GostopScoreLine[] = []

  const gwang = gwangLine(capture.gwang, rules)
  if (gwang !== null) lines.push(gwang)

  const yeolCount = capture.yeol.length
  if (yeolCount >= YEOL_MIN) {
    lines.push({ source: `열끗${yeolCount}`, points: yeolCount - (YEOL_MIN - 1) })
  }

  const ttiCount = capture.tti.length
  if (ttiCount >= TTI_MIN) {
    lines.push({ source: `띠${ttiCount}`, points: ttiCount - (TTI_MIN - 1) })
  }

  if (capture.piValue >= PI_MIN) {
    lines.push({ source: `피${capture.piValue}`, points: capture.piValue - (PI_MIN - 1) })
  }

  const godoriCount = capture.yeol.filter((card) => card.isGodori).length
  if (godoriCount === GODORI_SIZE) {
    lines.push({ source: '고도리', points: 5 })
  }

  const danSources = [
    { tti: 'hong', source: '홍단' },
    { tti: 'cheong', source: '청단' },
    { tti: 'cho', source: '초단' },
  ] as const
  for (const dan of danSources) {
    const count = capture.tti.filter((card) => card.tti === dan.tti).length
    if (count === DAN_SIZE) {
      lines.push({ source: dan.source, points: 3 })
    }
  }

  return lines
}

/**
 * 광 점수. 3광 = 3점 (비광 포함 + `bipiCountsAsGwang: false` 면 2점),
 * 4광 = 4점, 5광 = 15점.
 */
function gwangLine(gwang: readonly HwatuCard[], rules: GostopRules): GostopScoreLine | null {
  const count = gwang.length
  if (count < GWANG_MIN) return null
  if (count >= 5) return { source: '광5', points: 15 }
  if (count === 4) return { source: '광4', points: 4 }

  const hasBigwang = gwang.some((card) => card.id === BIGWANG_ID)
  if (hasBigwang && !rules.bipiCountsAsGwang) {
    return { source: '광3(비광)', points: 2 }
  }
  return { source: '광3', points: 3 }
}

/**
 * 고 가산 라인. `goBonusFlat` 인덱스 0 = 1고.
 * 배열 범위를 넘는 고 수(보통 3고 이상)는 마지막 항목이 유지되고 배수가 이어받는다.
 */
function goBonusLine(goCount: number, rules: GostopRules): GostopScoreLine | null {
  if (goCount <= 0 || rules.goBonusFlat.length === 0) return null
  const index = Math.min(goCount, rules.goBonusFlat.length) - 1
  const points = rules.goBonusFlat[index]
  if (points === undefined || points <= 0) return null
  return { source: `${goCount}고`, points }
}

/** 고 배수. `goMultiplierFrom` 부터 고당 ×2 누적 — 3고 ×2, 4고 ×4, 5고 ×8 … */
function goMultiplier(goCount: number, rules: GostopRules): GostopMultiplier | null {
  if (goCount < rules.goMultiplierFrom) return null
  const doublings = goCount - rules.goMultiplierFrom + 1
  return { source: `${goCount}고`, factor: 2 ** doublings }
}

/**
 * 박 배수 (룰 토글별).
 * - 피박: 승자가 피 점수를 냈고, 패자 중 피 환산 5 이하가 있으면 ×2
 * - 광박: 승자가 광 점수를 냈고, 패자 중 광 0장이 있으면 ×2
 * - 멍박: 승자가 열끗 점수를 냈고, 패자 중 열끗 0장이 있으면 ×2 (광박과 대칭 정의)
 */
function bakMultipliers(
  capture: GostopCapture,
  context: GostopContext,
  rules: GostopRules,
): readonly GostopMultiplier[] {
  const result: GostopMultiplier[] = []
  const wonPi = capture.piValue >= PI_MIN
  const wonGwang = capture.gwang.length >= GWANG_MIN
  const wonYeol = capture.yeol.length >= YEOL_MIN

  if (rules.piBak && wonPi && context.opponents.some((opp) => opp.piValue <= PIBAK_MAX_PI)) {
    result.push({ source: '피박', factor: 2 })
  }
  if (rules.gwangBak && wonGwang && context.opponents.some((opp) => opp.gwang.length === 0)) {
    result.push({ source: '광박', factor: 2 })
  }
  if (rules.meongBak && wonYeol && context.opponents.some((opp) => opp.yeol.length === 0)) {
    result.push({ source: '멍박', factor: 2 })
  }
  return result
}

/** 선언 배수 — 흔들기·폭탄. 선언 1회당 룰 배수를 거듭제곱으로 누적한다. */
function declarationMultipliers(
  context: GostopContext,
  rules: GostopRules,
): readonly GostopMultiplier[] {
  const result: GostopMultiplier[] = []
  if (context.shakeCount > 0 && rules.shakeMultiplier > 1) {
    result.push({
      source: context.shakeCount > 1 ? `흔들기 ${context.shakeCount}회` : '흔들기',
      factor: rules.shakeMultiplier ** context.shakeCount,
    })
  }
  if (context.bombCount > 0 && rules.bombMultiplier > 1) {
    result.push({
      source: context.bombCount > 1 ? `폭탄 ${context.bombCount}회` : '폭탄',
      factor: rules.bombMultiplier ** context.bombCount,
    })
  }
  return result
}

function sumPoints(lines: readonly GostopScoreLine[]): number {
  return lines.reduce((acc, line) => acc + line.points, 0)
}
