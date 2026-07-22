import { clsx } from 'clsx'
import type { HwatuCard, TtiKind } from '@/features/hwatu/types'

type CardSize = 'sm' | 'md'

const SIZE_CLASSES: Record<CardSize, { box: string; month: string; icon: string; ribbon: string; label: string }> = {
  sm: {
    box: 'w-full max-w-20',
    month: 'text-[10px]',
    icon: 'text-xl',
    ribbon: 'text-[8px]',
    label: 'text-[8px]',
  },
  md: {
    box: 'w-full max-w-28',
    month: 'text-xs',
    icon: 'text-3xl',
    ribbon: 'text-[10px]',
    label: 'text-[10px]',
  },
}

/** 월별 열끗 비주얼. 실물 화투 도안과 완전히 일치하진 않는 장식용 매핑. */
const YEOL_ICON: Partial<Record<HwatuCard['month'], string>> = {
  2: '🐦',
  4: '🐤',
  5: '🌉',
  6: '🦋',
  7: '🐗',
  8: '🦢',
  9: '🍶',
  10: '🦌',
  12: '🐦‍⬛',
}

const TTI_STYLE: Record<Exclude<TtiKind, null> | 'none', { bg: string; label: string }> = {
  hong: { bg: 'bg-red-600', label: '홍단' },
  cheong: { bg: 'bg-blue-600', label: '청단' },
  cho: { bg: 'bg-orange-600', label: '초단' },
  none: { bg: 'bg-neutral-500', label: '띠' },
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

  return (
    <div
      className={clsx(
        'relative flex aspect-[2/3] flex-col items-center justify-between overflow-hidden rounded-md border-2 border-black/80 bg-[#fbf3e3] px-0.5 py-1 text-black shadow-sm',
        s.box,
        selected && 'ring-2 ring-accent ring-offset-1 ring-offset-bg',
      )}
    >
      <span className={clsx('font-black leading-none text-black/70', s.month)}>{card.month}월</span>
      <div className="flex flex-1 items-center justify-center">{renderCenter(card, s)}</div>
      <span className={clsx('w-full truncate px-0.5 text-center font-bold leading-tight text-black/80', s.label)}>
        {card.label}
      </span>
    </div>
  )
}

function renderCenter(card: HwatuCard, s: (typeof SIZE_CLASSES)[CardSize]) {
  switch (card.kind) {
    case 'gwang':
      // 12월(비광)은 光 대신 우산 비주얼로 구분한다. 나머지 광은 光 글자.
      return (
        <span className="flex aspect-square w-[70%] items-center justify-center rounded-full bg-red-600 text-white">
          <span className={s.icon}>{card.month === 12 ? '☔' : '光'}</span>
        </span>
      )
    case 'yeol':
      return <span className={s.icon}>{YEOL_ICON[card.month] ?? '⭐'}</span>
    case 'tti': {
      const style = TTI_STYLE[card.tti ?? 'none']
      return (
        <span
          className={clsx(
            'flex h-[85%] w-2/5 flex-col items-center justify-center gap-0.5 rounded-sm font-bold text-white',
            style.bg,
            s.ribbon,
          )}
        >
          {[...style.label].map((ch, i) => (
            <span key={i}>{ch}</span>
          ))}
        </span>
      )
    }
    case 'pi':
      return (
        <span className="relative flex flex-col items-center text-green-700">
          <span className={s.icon}>🍃</span>
          {card.piValue === 2 && (
            <span className="absolute -right-2.5 -top-1 rounded-full bg-black px-1 py-px text-[7px] font-black leading-none text-white">
              ×2
            </span>
          )}
        </span>
      )
  }
}
