import { HwatuCardView } from '@/components/hwatu-card'
import { findCard } from '@/features/hwatu/cards'
import type { HwatuCard } from '@/features/hwatu/types'

function resolveCard(id: string): HwatuCard {
  const card = findCard(id)
  if (!card) throw new Error(`가이드 카드 id 오류: ${id}`)
  return card
}

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