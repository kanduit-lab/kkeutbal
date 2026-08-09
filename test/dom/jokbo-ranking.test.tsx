import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SeotdaRankingPanel } from '@/features/jokbo-advisor/components/seotda-ranking-panel'
import { PokerRankingPanel } from '@/features/jokbo-advisor/components/poker-ranking-panel'
import { SEOTDA_RANK_TABLE } from '@/features/jokbo-advisor/components/seotda-rank-table'
import { POKER_RANK_TABLE } from '@/features/jokbo-advisor/components/poker-rank-table'
import { findCard } from '@/features/hwatu/cards'
import type { HwatuCard } from '@/features/hwatu/types'
import { ko, renderWithProviders } from './render-helpers'

/**
 * 족보 순위표 회귀 고정.
 *
 * 예전에는 현재 족보 둘레 몇 줄만 잘라 그리고 위아래에 "N단계 더 있어요"를 적었는데, 그
 * 영역이 `overflow-hidden`이라 아무리 굴려도 움직이지 않았다 — 29단계짜리 표에서 23단계가
 * 남았다고 알려주면서 거기로 갈 방법을 주지 않았다. 지금은 표를 전부 그리고 바깥 결과
 * 컬럼 하나가 스크롤한다. jsdom은 실제 스크롤을 재현하지 못하므로, 여기서는 "전부 그린다"와
 * "안내 문구로 때우지 않는다"를 고정한다.
 */
afterEach(cleanup)

function seotdaCards(...ids: readonly string[]): readonly HwatuCard[] {
  return ids.map((id) => {
    const card = findCard(id)
    if (!card) throw new Error(`unknown card ${id}`)
    return card
  })
}

describe('SeotdaRankingPanel', () => {
  it('renders every tier, not a sliced window', () => {
    renderWithProviders(<SeotdaRankingPanel cards={[]} />)

    for (const tier of SEOTDA_RANK_TABLE) {
      expect(screen.getAllByText(tier.label).length).toBeGreaterThan(0)
    }
    expect(screen.getAllByText(/^\d+위$/)).toHaveLength(SEOTDA_RANK_TABLE.length)
  })

  it('says what the table is instead of repeating the picker instruction', () => {
    renderWithProviders(<SeotdaRankingPanel cards={[]} />)

    // 바로 위 결과 패널이 이미 "카드 2장을 선택하세요"라고 말한다.
    expect(screen.queryByText(ko.advisor.selectTwoCards)).toBeNull()
    expect(
      screen.getByText(
        ko.advisor.ranking.totalTiers.replace('{total}', String(SEOTDA_RANK_TABLE.length)),
      ),
    ).not.toBeNull()
  })

  it('marks the held hand so the column can scroll to it', () => {
    // 벚꽃 광 + 홍싸리 멧돼지 = 땡잡이, 망통
    renderWithProviders(<SeotdaRankingPanel cards={seotdaCards('03-gwang', '07-yeol')} />)

    const current = screen.getAllByText(ko.advisor.ranking.current)
    expect(current.length).toBeGreaterThan(0)
    expect(screen.getAllByText(/망통/).length).toBeGreaterThan(0)
  })

  it('swaps the table for the caveats and back', () => {
    renderWithProviders(<SeotdaRankingPanel cards={[]} />)

    expect(screen.queryByText(ko.advisor.ranking.caveats.ttaengjabi.title)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: ko.advisor.ranking.caveatsToggleShow }))
    expect(screen.getByText(ko.advisor.ranking.caveats.ttaengjabi.title)).not.toBeNull()
    expect(screen.getByText(ko.advisor.ranking.caveats.gusa.title)).not.toBeNull()

    // hover 로만 열리는 표면을 만들지 않는다 — 같은 버튼으로 닫힌다.
    fireEvent.click(screen.getByRole('button', { name: ko.advisor.ranking.caveatsToggleHide }))
    expect(screen.queryByText(ko.advisor.ranking.caveats.ttaengjabi.title)).toBeNull()
  })
})

describe('PokerRankingPanel', () => {
  it('renders every tier, not a sliced window', () => {
    renderWithProviders(<PokerRankingPanel cards={[]} />)

    for (const tier of POKER_RANK_TABLE) {
      expect(screen.getAllByText(tier.label).length).toBeGreaterThan(0)
    }
    expect(screen.getAllByText(/^\d+위$/)).toHaveLength(POKER_RANK_TABLE.length)
  })
})
