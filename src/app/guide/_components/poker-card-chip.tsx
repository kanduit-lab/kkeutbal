import { PokerCardView } from '@/components/poker-card'
import { findPokerCard } from '@/features/poker/cards'

/** 가이드 족보 예시용 트럼프 카드 한 장 — 실물 카드 얼굴 렌더링은 PokerCardView 에 위임한다. */
export function PokerCardChip({ id }: { id: string }) {
  const card = findPokerCard(id)
  if (!card) throw new Error(`가이드 포커 카드 id 오류: ${id}`)

  return <PokerCardView card={card} size="sm" />
}
