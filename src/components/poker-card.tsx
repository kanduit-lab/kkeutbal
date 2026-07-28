import { clsx } from 'clsx'
import { SUIT_LABELS } from '@/features/poker/cards'
import type { PokerCard, PokerSuit } from '@/features/poker/cards'

export type PokerCardSize = 'xs' | 'sm' | 'md'

const SIZE_CLASSES: Record<PokerCardSize, string> = {
  xs: 'w-full max-w-16',
  sm: 'w-full max-w-24',
  md: 'w-full max-w-36',
}

const RED_SUITS: ReadonlySet<PokerSuit> = new Set(['h', 'd'])

export function isRedPokerSuit(suit: PokerSuit): boolean {
  return RED_SUITS.has(suit)
}

const VIEW_W = 200
const VIEW_H = 280
const CENTER_X = VIEW_W / 2
const CENTER_Y = VIEW_H / 2

const CORNER_X = 20
const CORNER_RANK_Y = 42
const CORNER_SUIT_Y = 70
const CORNER_RANK_SIZE = 34
const CORNER_SUIT_SIZE = 24

const PIP_SIZE = 26

interface PipSpot {
  readonly x: number
  readonly y: number
  readonly rotate?: boolean
}

const PIP_ROWS = [64, 84, 104, 122, 140, 158, 176, 196, 216] as const
const PIP_COL = { l: 76, c: 100, r: 124 } as const

function buildPipLayouts(): ReadonlyMap<number, readonly PipSpot[]> {
  const c = PIP_COL
  const y = PIP_ROWS
  const layouts = new Map<number, readonly PipSpot[]>()

  layouts.set(2, [
    { x: c.c, y: y[0] },
    { x: c.c, y: y[8], rotate: true },
  ])
  layouts.set(3, [
    { x: c.c, y: y[0] },
    { x: c.c, y: y[4] },
    { x: c.c, y: y[8], rotate: true },
  ])
  layouts.set(4, [
    { x: c.l, y: y[0] },
    { x: c.r, y: y[0] },
    { x: c.l, y: y[8], rotate: true },
    { x: c.r, y: y[8], rotate: true },
  ])
  layouts.set(5, [
    { x: c.l, y: y[0] },
    { x: c.r, y: y[0] },
    { x: c.c, y: y[4] },
    { x: c.l, y: y[8], rotate: true },
    { x: c.r, y: y[8], rotate: true },
  ])
  layouts.set(6, [
    { x: c.l, y: y[0] },
    { x: c.r, y: y[0] },
    { x: c.l, y: y[4] },
    { x: c.r, y: y[4] },
    { x: c.l, y: y[8], rotate: true },
    { x: c.r, y: y[8], rotate: true },
  ])
  layouts.set(7, [
    { x: c.l, y: y[0] },
    { x: c.r, y: y[0] },
    { x: c.c, y: y[2] },
    { x: c.l, y: y[4] },
    { x: c.r, y: y[4] },
    { x: c.l, y: y[8], rotate: true },
    { x: c.r, y: y[8], rotate: true },
  ])
  layouts.set(8, [
    { x: c.l, y: y[0] },
    { x: c.r, y: y[0] },
    { x: c.c, y: y[2] },
    { x: c.l, y: y[4] },
    { x: c.r, y: y[4] },
    { x: c.c, y: y[6], rotate: true },
    { x: c.l, y: y[8], rotate: true },
    { x: c.r, y: y[8], rotate: true },
  ])
  layouts.set(9, [
    { x: c.l, y: y[0] },
    { x: c.r, y: y[0] },
    { x: c.l, y: y[2] },
    { x: c.r, y: y[2] },
    { x: c.c, y: y[4] },
    { x: c.l, y: y[6], rotate: true },
    { x: c.r, y: y[6], rotate: true },
    { x: c.l, y: y[8], rotate: true },
    { x: c.r, y: y[8], rotate: true },
  ])
  layouts.set(10, [
    { x: c.l, y: y[0] },
    { x: c.r, y: y[0] },
    { x: c.c, y: y[1] },
    { x: c.l, y: y[3] },
    { x: c.r, y: y[3] },
    { x: c.l, y: y[5], rotate: true },
    { x: c.r, y: y[5], rotate: true },
    { x: c.c, y: y[7], rotate: true },
    { x: c.l, y: y[8], rotate: true },
    { x: c.r, y: y[8], rotate: true },
  ])

  return layouts
}

const PIP_LAYOUTS = buildPipLayouts()

function CardCenter({
  rank,
  rankChar,
  suitGlyph,
}: {
  rank: number
  rankChar: string
  suitGlyph: string
}) {
  if (rank === 14) {
    return (
      <text
        x={CENTER_X}
        y={CENTER_Y}
        fontSize={112}
        textAnchor="middle"
        dominantBaseline="central"
        className="font-black"
        fill="currentColor"
      >
        {suitGlyph}
      </text>
    )
  }

  if (rank >= 11) {
    return (
      <>
        <rect
          x={42}
          y={86}
          width={116}
          height={168}
          rx={10}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          opacity={0.3}
        />
        <text
          x={CENTER_X}
          y={118}
          fontSize={98}
          textAnchor="middle"
          dominantBaseline="central"
          className="font-black"
          fill="currentColor"
        >
          {rankChar}
        </text>
        <text
          x={CENTER_X}
          y={202}
          fontSize={44}
          textAnchor="middle"
          dominantBaseline="central"
          fill="currentColor"
        >
          {suitGlyph}
        </text>
      </>
    )
  }

  const spots = PIP_LAYOUTS.get(rank) ?? []
  return (
    <>
      {spots.map((spot) => (
        <text
          key={`${spot.x}-${spot.y}`}
          x={spot.x}
          y={spot.y}
          fontSize={PIP_SIZE}
          textAnchor="middle"
          dominantBaseline="central"
          fill="currentColor"
          transform={spot.rotate ? `rotate(180 ${spot.x} ${spot.y})` : undefined}
        >
          {suitGlyph}
        </text>
      ))}
    </>
  )
}

const FONT_STACK =
  "Pretendard, 'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', system-ui, sans-serif"

export function PokerCardView({
  card,
  size = 'md',
  selected = false,
  disabled = false,
}: {
  card: PokerCard
  size?: PokerCardSize
  selected?: boolean
  disabled?: boolean
}) {
  const red = isRedPokerSuit(card.suit)
  const rankChar = card.label.slice(1)
  const suitGlyph = SUIT_LABELS[card.suit]

  return (
    <div
      role="img"
      aria-label={card.label}
      className={clsx(
        'relative block aspect-[5/7] overflow-hidden rounded-lg shadow-md',
        SIZE_CLASSES[size],
        red ? 'text-accent' : 'text-black',
        selected && 'ring-2 ring-accent ring-offset-1 ring-offset-bg',
        disabled && 'opacity-40 grayscale',
      )}
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="h-full w-full"
        aria-hidden="true"
        fontFamily={FONT_STACK}
      >
        <rect
          x={3}
          y={3}
          width={VIEW_W - 6}
          height={VIEW_H - 6}
          rx={14}
          fill="#fbf3e3"
          stroke="rgba(0,0,0,0.35)"
          strokeWidth={3}
        />
        <text
          x={CORNER_X}
          y={CORNER_RANK_Y}
          fontSize={CORNER_RANK_SIZE}
          textAnchor="middle"
          dominantBaseline="central"
          className="font-black"
          fill="currentColor"
        >
          {rankChar}
        </text>
        <text
          x={CORNER_X}
          y={CORNER_SUIT_Y}
          fontSize={CORNER_SUIT_SIZE}
          textAnchor="middle"
          dominantBaseline="central"
          fill="currentColor"
        >
          {suitGlyph}
        </text>
        <g transform={`rotate(180 ${CENTER_X} ${CENTER_Y})`}>
          <text
            x={CORNER_X}
            y={CORNER_RANK_Y}
            fontSize={CORNER_RANK_SIZE}
            textAnchor="middle"
            dominantBaseline="central"
            className="font-black"
            fill="currentColor"
          >
            {rankChar}
          </text>
          <text
            x={CORNER_X}
            y={CORNER_SUIT_Y}
            fontSize={CORNER_SUIT_SIZE}
            textAnchor="middle"
            dominantBaseline="central"
            fill="currentColor"
          >
            {suitGlyph}
          </text>
        </g>
        <CardCenter rank={card.rank} rankChar={rankChar} suitGlyph={suitGlyph} />
      </svg>
    </div>
  )
}