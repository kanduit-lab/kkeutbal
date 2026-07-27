import { PokerCardView, type PokerCardSize } from '@/components/poker-card'
import { findPokerCard } from '@/features/poker/cards'

/**
 * 가이드 족보 예시용 트럼프 카드 한 장 — 실물 카드 얼굴 렌더링은 PokerCardView 에 위임한다.
 * 서열표에서는 5장이 한 줄에 들어가야 해서 기본을 xs(64px)로 둔다.
 */
export function PokerCardChip({ id, size = 'xs' }: { id: string; size?: PokerCardSize }) {
  const card = findPokerCard(id)
  if (!card) throw new Error(`가이드 포커 카드 id 오류: ${id}`)

  return <PokerCardView card={card} size={size} />
}
