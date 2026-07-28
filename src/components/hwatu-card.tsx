import { clsx } from 'clsx'
import type { HwatuCard } from '@/features/hwatu/types'
import { CELL_H, CELL_W, SHEET_H, SHEET_URL, SHEET_W, spriteOf } from '@/features/hwatu/sprite'

type CardSize = 'sm' | 'md'

const SIZE_CLASSES: Record<CardSize, { box: string; month: string; label: string }> = {
  sm: { box: 'w-full max-w-24', month: 'text-[10px]', label: 'text-[9px]' },
  md: { box: 'w-full max-w-36', month: 'text-xs', label: 'text-[11px]' },
}

function spriteStyle(cardId: string): React.CSSProperties | null {
  const pos = spriteOf(cardId)
  if (!pos) return null
  return {
    backgroundImage: `url(${SHEET_URL})`,
    backgroundSize: `${(SHEET_W / CELL_W) * 100}% ${(SHEET_H / CELL_H) * 100}%`,
    backgroundPosition: `${(pos.x / (SHEET_W - CELL_W)) * 100}% ${(pos.y / (SHEET_H - CELL_H)) * 100}%`,
  }
}

export function HwatuCardView({
  card,
  size = 'md',
  selected = false,
}: {
  card: HwatuCard
  size?: CardSize
  selected?: boolean
}) {
  const s = SIZE_CLASSES[size]
  const style = spriteStyle(card.id)

  return (
    <div
      className={clsx(
        'relative aspect-[103/168] overflow-hidden rounded-md bg-white shadow-sm',
        s.box,
        selected && 'ring-2 ring-accent ring-offset-1 ring-offset-bg',
      )}
      style={style ?? undefined}
      role="img"
      aria-label={card.label}
    >
      <span
        className={clsx(
          'absolute left-0.5 top-0.5 rounded bg-black/60 px-1 py-px font-bold leading-tight text-white',
          s.month,
        )}
      >
        {card.month}
      </span>
      {card.piValue === 2 ? (
        <span
          className={clsx(
            'absolute right-0.5 top-0.5 rounded bg-black/70 px-1 py-px font-black leading-tight text-white',
            s.label,
          )}
        >
          쌍피
        </span>
      ) : null}
    </div>
  )
}