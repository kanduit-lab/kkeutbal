import type { CardKind, HwatuCard, Month, TtiKind } from './types'

/**
 * 화투 48장 = 12개월 × 4장.
 *
 * 구성 근거는 docs/04-game-engines.md 의 "광 · 고도리 · 단 기준" 표.
 * 월별 명세를 선언하고 덱을 파생시킨다 — 48줄을 손으로 나열하면 중복 오타가 나기 쉽다.
 */

interface CardSpec {
  readonly kind: CardKind
  readonly tti?: Exclude<TtiKind, null>
  /** 피 환산값. 생략 시 일반 피(1). */
  readonly pi?: 1 | 2
  readonly godori?: true
  readonly label: string
}

interface MonthSpec {
  readonly month: Month
  readonly name: string
  readonly cards: readonly CardSpec[]
}

const MONTH_SPECS: readonly MonthSpec[] = [
  {
    month: 1,
    name: '송학',
    cards: [
      { kind: 'gwang', label: '송학 광' },
      { kind: 'tti', tti: 'hong', label: '송학 홍단' },
      { kind: 'pi', label: '송학 피' },
      { kind: 'pi', label: '송학 피' },
    ],
  },
  {
    month: 2,
    name: '매조',
    cards: [
      { kind: 'yeol', godori: true, label: '매조 새' },
      { kind: 'tti', tti: 'hong', label: '매조 홍단' },
      { kind: 'pi', label: '매조 피' },
      { kind: 'pi', label: '매조 피' },
    ],
  },
  {
    month: 3,
    name: '벚꽃',
    cards: [
      { kind: 'gwang', label: '벚꽃 광' },
      { kind: 'tti', tti: 'hong', label: '벚꽃 홍단' },
      { kind: 'pi', label: '벚꽃 피' },
      { kind: 'pi', label: '벚꽃 피' },
    ],
  },
  {
    month: 4,
    name: '흑싸리',
    cards: [
      { kind: 'yeol', godori: true, label: '흑싸리 새' },
      { kind: 'tti', tti: 'cho', label: '흑싸리 초단' },
      { kind: 'pi', label: '흑싸리 피' },
      { kind: 'pi', label: '흑싸리 피' },
    ],
  },
  {
    month: 5,
    name: '난초',
    cards: [
      { kind: 'yeol', label: '난초 다리' },
      { kind: 'tti', tti: 'cho', label: '난초 초단' },
      { kind: 'pi', label: '난초 피' },
      { kind: 'pi', label: '난초 피' },
    ],
  },
  {
    month: 6,
    name: '모란',
    cards: [
      { kind: 'yeol', label: '모란 나비' },
      { kind: 'tti', tti: 'cheong', label: '모란 청단' },
      { kind: 'pi', label: '모란 피' },
      { kind: 'pi', label: '모란 피' },
    ],
  },
  {
    month: 7,
    name: '홍싸리',
    cards: [
      { kind: 'yeol', label: '홍싸리 멧돼지' },
      { kind: 'tti', tti: 'cho', label: '홍싸리 초단' },
      { kind: 'pi', label: '홍싸리 피' },
      { kind: 'pi', label: '홍싸리 피' },
    ],
  },
  {
    month: 8,
    name: '공산',
    cards: [
      { kind: 'gwang', label: '공산 광' },
      { kind: 'yeol', godori: true, label: '공산 기러기' },
      { kind: 'pi', label: '공산 피' },
      { kind: 'pi', label: '공산 피' },
    ],
  },
  {
    month: 9,
    // 국진(술잔)은 룰에 따라 쌍피로 쓸 수 있다. 기본값은 열끗이며 전환은 룰 프리셋이 담당한다.
    name: '국화',
    cards: [
      { kind: 'yeol', label: '국화 국진' },
      { kind: 'tti', tti: 'cheong', label: '국화 청단' },
      { kind: 'pi', label: '국화 피' },
      { kind: 'pi', label: '국화 피' },
    ],
  },
  {
    month: 10,
    name: '단풍',
    cards: [
      { kind: 'yeol', label: '단풍 사슴' },
      { kind: 'tti', tti: 'cheong', label: '단풍 청단' },
      { kind: 'pi', label: '단풍 피' },
      { kind: 'pi', label: '단풍 피' },
    ],
  },
  {
    month: 11,
    name: '오동',
    cards: [
      { kind: 'gwang', label: '오동 광' },
      { kind: 'pi', pi: 2, label: '오동 쌍피' },
      { kind: 'pi', label: '오동 피' },
      { kind: 'pi', label: '오동 피' },
    ],
  },
  {
    month: 12,
    // 비띠는 홍/청/초 어디에도 속하지 않으므로 tti 를 지정하지 않는다.
    name: '비',
    cards: [
      { kind: 'gwang', label: '비광' },
      { kind: 'yeol', label: '비 제비' },
      { kind: 'tti', label: '비띠' },
      { kind: 'pi', pi: 2, label: '비 쌍피' },
    ],
  },
]

function buildDeck(): readonly HwatuCard[] {
  // 로컬 accumulator — 함수 밖으로 새지 않으므로 push 사용 (coding-style 예외 규정)
  const deck: HwatuCard[] = []

  for (const spec of MONTH_SPECS) {
    const kindCounts = new Map<CardKind, number>()
    const kindTotals = new Map<CardKind, number>()

    for (const card of spec.cards) {
      kindTotals.set(card.kind, (kindTotals.get(card.kind) ?? 0) + 1)
    }

    for (const card of spec.cards) {
      const seen = (kindCounts.get(card.kind) ?? 0) + 1
      kindCounts.set(card.kind, seen)

      const total = kindTotals.get(card.kind) ?? 1
      const mm = String(spec.month).padStart(2, '0')
      const suffix = total > 1 ? `-${seen}` : ''

      deck.push({
        id: `${mm}-${card.kind}${suffix}`,
        month: spec.month,
        kind: card.kind,
        tti: card.kind === 'tti' ? (card.tti ?? null) : null,
        piValue: card.kind === 'pi' ? (card.pi ?? 1) : 0,
        isGodori: card.godori ?? false,
        // 섯다 덱 = 1~10월의 비(非)피 카드. 월별 정확히 2장씩 = 20장.
        seotda: spec.month <= 10 && card.kind !== 'pi',
        label: card.label,
      })
    }
  }

  return Object.freeze(deck)
}

/** 화투 전체 48장. */
export const HWATU_DECK: readonly HwatuCard[] = buildDeck()

/** 섯다 20장 (1~10월 각 2장). */
export const SEOTDA_DECK: readonly HwatuCard[] = Object.freeze(
  HWATU_DECK.filter((card) => card.seotda),
)

const BY_ID: ReadonlyMap<string, HwatuCard> = new Map(HWATU_DECK.map((card) => [card.id, card]))

/** id 로 카드 조회. 없으면 `undefined`. 외부 입력(vision·DB)은 반드시 이 경로로 정규화한다. */
export function findCard(id: string): HwatuCard | undefined {
  return BY_ID.get(id)
}

/** 월 기준 카드 목록. */
export function cardsOfMonth(month: Month): readonly HwatuCard[] {
  return HWATU_DECK.filter((card) => card.month === month)
}

/** 게임별 사용 덱. */
export function deckFor(gameType: 'seotda' | 'gostop'): readonly HwatuCard[] {
  return gameType === 'seotda' ? SEOTDA_DECK : HWATU_DECK
}
