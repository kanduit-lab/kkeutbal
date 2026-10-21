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

// 핍 크기: 코너 랭크(34)와 비슷한 무게감을 주되 rank10의 최소 세로 간격(42px, 아래
// PIP_ROWS 참고)에서 같은 열 핍끼리 겹치지 않는 상한선. 기존 26은 200폭 카드에서
// 시각적으로 왜소해 보인다는 지적을 반영해 키웠다.
const PIP_SIZE = 32

interface PipSpot {
  readonly x: number
  readonly y: number
  readonly rotate?: boolean
}

// 실카드 핍 필드의 세로 9행. 중앙(140)을 기준으로 21px씩 등간격 대칭
// (56·77·98·119·140·161·182·203·224) — 8칸 × 21 = 168px. 같은 열을 쓰는 행 중
// 가장 가까운 조합은 rank10의 119/161(42px 간격)로, PIP_SIZE=32에서 겹치지 않는다.
const PIP_ROWS = [56, 77, 98, 119, 140, 161, 182, 203, 224] as const
// 핍 좌우 열은 카드 폭(200)의 30%/70% 지점 — 실제 트럼프 카드의 좌우 열 위치.
// 기존 76/124는 중앙(100)에서 24px밖에 안 떨어져 "얇은 중앙 띠"로 보였다.
const PIP_COL = { l: 60, c: 100, r: 140 } as const

// J/Q/K 프레임: 코너 인덱스(x=20 부근 좁은 열)와 겹치지 않는 안쪽 사각형.
// 세로 범위(54~226)는 PIP_ROWS 필드(56~224)와 거의 같아 핍 카드와 비례가 맞는다.
const FACE_FRAME = { x: 34, y: 54, w: 132, h: 172, rx: 14 } as const
const FACE_INSET = 6 // 이중 테두리 사이 간격 — 인그레이빙(engraving) 느낌
const FACE_TICK = 5 // 프레임 네 모서리의 금색 다이아몬드 장식 한 변의 절반
const FACE_RANK_SIZE = 80
const FACE_SUIT_SIZE = 30
const FACE_SUIT_TOP_Y = 84
const FACE_SUIT_BOTTOM_Y = 196

const FACE_CORNERS = [
  { x: FACE_FRAME.x + 10, y: FACE_FRAME.y + 10 },
  { x: FACE_FRAME.x + FACE_FRAME.w - 10, y: FACE_FRAME.y + 10 },
  { x: FACE_FRAME.x + 10, y: FACE_FRAME.y + FACE_FRAME.h - 10 },
  { x: FACE_FRAME.x + FACE_FRAME.w - 10, y: FACE_FRAME.y + FACE_FRAME.h - 10 },
] as const

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

/**
 * J/Q/K: 인물화 대신 이 앱의 gilt/lacquer 톤(금색 이중 테두리 + 모서리 다이아몬드
 * 장식)을 쓴 미니멀 인덱스 카드. 얇은 opacity 사각형 하나만 있던 이전 버전은
 * "자리표시자"처럼 보인다는 지적이 있어, 의도적으로 그린 프레임임을 드러내도록
 * 테두리를 이중으로 겹치고 무늬를 랭크 위아래로 대칭 배치했다. 금색(#e5b954)은
 * globals.css의 --color-gold와 같은 값 — 이 파일은 카드 면(#fbf3e3)처럼 SVG
 * 색을 항상 리터럴 hex로 쓰는 관례라 var()를 새로 들이지 않고 값만 맞췄다.
 */
function FaceCard({ rankChar, suitGlyph }: { rankChar: string; suitGlyph: string }) {
  return (
    <>
      <rect
        x={FACE_FRAME.x}
        y={FACE_FRAME.y}
        width={FACE_FRAME.w}
        height={FACE_FRAME.h}
        rx={FACE_FRAME.rx}
        fill="none"
        stroke="#e5b954"
        strokeWidth={1.5}
        opacity={0.55}
      />
      <rect
        x={FACE_FRAME.x + FACE_INSET}
        y={FACE_FRAME.y + FACE_INSET}
        width={FACE_FRAME.w - FACE_INSET * 2}
        height={FACE_FRAME.h - FACE_INSET * 2}
        rx={Math.max(FACE_FRAME.rx - FACE_INSET, 2)}
        fill="none"
        stroke="#e5b954"
        strokeWidth={1}
        opacity={0.32}
      />
      {FACE_CORNERS.map((corner) => (
        <rect
          key={`${corner.x}-${corner.y}`}
          x={corner.x - FACE_TICK}
          y={corner.y - FACE_TICK}
          width={FACE_TICK * 2}
          height={FACE_TICK * 2}
          transform={`rotate(45 ${corner.x} ${corner.y})`}
          fill="#e5b954"
          opacity={0.6}
        />
      ))}
      <text
        x={CENTER_X}
        y={FACE_SUIT_TOP_Y}
        fontSize={FACE_SUIT_SIZE}
        textAnchor="middle"
        dominantBaseline="central"
        fill="currentColor"
      >
        {suitGlyph}
      </text>
      <text
        x={CENTER_X}
        y={CENTER_Y}
        fontSize={FACE_RANK_SIZE}
        textAnchor="middle"
        dominantBaseline="central"
        className="font-black"
        fill="currentColor"
      >
        {rankChar}
      </text>
      <text
        x={CENTER_X}
        y={FACE_SUIT_BOTTOM_Y}
        fontSize={FACE_SUIT_SIZE}
        textAnchor="middle"
        dominantBaseline="central"
        fill="currentColor"
        transform={`rotate(180 ${CENTER_X} ${FACE_SUIT_BOTTOM_Y})`}
      >
        {suitGlyph}
      </text>
    </>
  )
}

function CardCenter({
  rank,
  rankChar,
  suitGlyph,
  size,
}: {
  rank: number
  rankChar: string
  suitGlyph: string
  size: PokerCardSize
}) {
  // xs(실렌더 ~48-64px)에서는 핍 낱개나 J/Q/K 이중 테두리가 뭉개져 노이즈만
  // 남는다. 대신 랭크 글자를 크게 하나 놓는다 — 무늬는 색과 코너 글리프로
  // 이미 전달되고, 가이드 페이지처럼 조합을 가르치는 화면에서는 K와 A가
  // 한눈에 갈려야 하기 때문이다. 에이스는 크기와 무관하게 큰 무늬 한 개.
  if (size === 'xs') {
    return (
      <text
        x={CENTER_X}
        y={CENTER_Y}
        // "10"은 두 글자라 같은 크기로 두면 카드 폭을 넘는다
        fontSize={rankChar.length > 1 ? 82 : 110}
        textAnchor="middle"
        dominantBaseline="central"
        className="font-black"
        fill="currentColor"
      >
        {rankChar}
      </text>
    )
  }

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
    return <FaceCard rankChar={rankChar} suitGlyph={suitGlyph} />
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
        <CardCenter rank={card.rank} rankChar={rankChar} suitGlyph={suitGlyph} size={size} />
      </svg>
    </div>
  )
}