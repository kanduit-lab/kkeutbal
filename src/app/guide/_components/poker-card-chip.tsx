import { PokerCardView, type PokerCardSize } from '@/components/poker-card'
import { findPokerCard } from '@/features/poker/cards'

export function PokerCardChip({ id, size = 'xs' }: { id: string; size?: PokerCardSize }) {
  const card = findPokerCard(id)
  if (!card) throw new Error(`가이드 포커 카드 id 오류: ${id}`)

  return <PokerCardView card={card} size={size} />
}