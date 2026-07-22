import { HwatuCardView } from '@/components/hwatu-card'
import { findCard } from '@/features/hwatu/cards'
import type { HwatuCard } from '@/features/hwatu/types'

/**
 * 가이드 예시용 카드 id → 실제 카드 변환.
 * 여기서 쓰는 id는 전부 features/hwatu/cards.ts 덱과 대조해 확인한 값이다.
 * 오타가 있으면 가이드 페이지 렌더링 시점에 바로 에러로 드러난다.
 */
function resolveCard(id: string): HwatuCard {
  const card = findCard(id)
  if (!card) throw new Error(`가이드 카드 id 오류: ${id}`)
  return card
}

/** 족보 예시 — 화투 카드 실물 비주얼로 조합을 보여준다. */
export function CardPair({
  ids,
  label,
  note,
}: {
  ids: readonly string[]
  label: string
  note?: string
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl bg-bg-deep/40 p-3 text-center">
      <div className="flex gap-1">
        {ids.map((id) => (
          <HwatuCardView key={id} card={resolveCard(id)} size="md" />
        ))}
      </div>
      <div>
        <p className="font-brush text-sm font-bold">{label}</p>
        {note ? <p className="mt-0.5 text-xs text-muted">{note}</p> : null}
      </div>
    </div>
  )
}
