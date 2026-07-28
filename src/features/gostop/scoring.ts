import { findCard } from '../hwatu/cards'
import type { HwatuCard, Month } from '../hwatu/types'
import type {
  GostopCapture,
  GostopContext,
  GostopMultiplier,
  GostopRules,
  GostopScore,
  GostopScoreLine,
} from './types'

const GUKJIN_ID = '09-yeol'

const BIGWANG_ID = '12-gwang'

const GWANG_MIN = 3
const YEOL_MIN = 5
const TTI_MIN = 5
const PI_MIN = 10
const DAN_SIZE = 3
const GODORI_SIZE = 3

const PIBAK_MAX_PI = 5

const GUKJIN_PI_VALUE = 2

export function captureOf(cards: readonly HwatuCard[], rules: GostopRules): GostopCapture {
  const canonical = normalizeCards(cards, 'captureOf')
  const asYeol = classify(canonical, false)
  if (!rules.gukjinAsSsangpi || !canonical.some((card) => card.id === GUKJIN_ID)) {
    return asYeol
  }

  const asPi = classify(canonical, true)
  const yeolScore = sumPoints(baseLines(asYeol, rules))
  const piScore = sumPoints(baseLines(asPi, rules))
  return piScore >= yeolScore ? asPi : asYeol
}

export function scoreGostop(
  capture: GostopCapture,
  context: GostopContext,
  rules: GostopRules,
): GostopScore {
  validateRules(rules)
  validateCount('goCount', context.goCount)
  validateCount('shakeCount', context.shakeCount)
  validateCount('bombCount', context.bombCount)

  const canonicalCapture = normalizeCapture(capture, rules, 'capture')
  const canonicalContext: GostopContext = {
    ...context,
    opponents: context.opponents.map((opponent, index) =>
      normalizeCapture(opponent, rules, `opponents[${index}]`),
    ),
  }

  const cardLines = baseLines(canonicalCapture, rules)
  const base = sumPoints(cardLines)

  const goLine = goBonusLine(canonicalContext.goCount, rules)
  const breakdown = goLine === null ? cardLines : [...cardLines, goLine]

  const multipliers: GostopMultiplier[] = []
  const goMul = goMultiplier(canonicalContext.goCount, rules)
  if (goMul !== null) multipliers.push(goMul)
  multipliers.push(...bakMultipliers(canonicalCapture, canonicalContext, rules))
  multipliers.push(...declarationMultipliers(canonicalContext, rules))

  const additive = base + (goLine?.points ?? 0)
  const factor = multipliers.reduce((acc, mul) => acc * mul.factor, 1)
  const total = additive * factor
  if (!Number.isSafeInteger(factor) || !Number.isSafeInteger(total)) {
    throw new RangeError('고스톱 점수가 안전한 정수 범위를 벗어났다')
  }

  return {
    breakdown,
    base,
    multipliers,
    total,
    canStop: base >= rules.baseWinScore,
  }
}

export function hasChongtong(cards: readonly HwatuCard[]): boolean {
  const canonical = normalizeCards(cards, 'hasChongtong')
  const counts = new Map<Month, number>()
  for (const card of canonical) {
    const next = (counts.get(card.month) ?? 0) + 1
    if (next >= 4) return true
    counts.set(card.month, next)
  }
  return false
}

function normalizeCards(cards: readonly HwatuCard[], caller: string): readonly HwatuCard[] {
  const seen = new Set<string>()
  return cards.map((card) => {
    if (seen.has(card.id)) {
      throw new Error(`${caller}: 중복된 카드 — ${card.id}`)
    }
    const canonical = findCard(card.id)
    if (!canonical) {
      throw new Error(`${caller}: 화투 덱에 없는 카드 — ${card.id}`)
    }
    seen.add(card.id)
    return canonical
  })
}

function normalizeCapture(
  capture: GostopCapture,
  rules: GostopRules,
  caller: string,
): GostopCapture {
  return captureOf(
    normalizeCards(
      [...capture.gwang, ...capture.yeol, ...capture.tti, ...capture.pi],
      `scoreGostop ${caller}`,
    ),
    rules,
  )
}

function validateCount(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name}은 0 이상의 안전한 정수여야 한다`)
  }
}

function validateRules(rules: GostopRules): void {
  validateCount('baseWinScore', rules.baseWinScore)
  if (!Number.isSafeInteger(rules.goMultiplierFrom) || rules.goMultiplierFrom < 1) {
    throw new RangeError('goMultiplierFrom은 1 이상의 안전한 정수여야 한다')
  }
  for (const [index, value] of rules.goBonusFlat.entries()) {
    validateCount(`goBonusFlat[${index}]`, value)
  }
  for (const [name, value] of [
    ['shakeMultiplier', rules.shakeMultiplier],
    ['bombMultiplier', rules.bombMultiplier],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new RangeError(`${name}는 1 이상의 안전한 정수여야 한다`)
    }
  }
}

function classify(cards: readonly HwatuCard[], gukjinAsPi: boolean): GostopCapture {
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

function goBonusLine(goCount: number, rules: GostopRules): GostopScoreLine | null {
  if (goCount <= 0 || rules.goBonusFlat.length === 0) return null
  const index = Math.min(goCount, rules.goBonusFlat.length) - 1
  const points = rules.goBonusFlat[index]
  if (points === undefined || points <= 0) return null
  return { source: `${goCount}고`, points }
}

function goMultiplier(goCount: number, rules: GostopRules): GostopMultiplier | null {
  if (goCount < rules.goMultiplierFrom) return null
  const doublings = goCount - rules.goMultiplierFrom + 1
  return { source: `${goCount}고`, factor: 2 ** doublings }
}

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