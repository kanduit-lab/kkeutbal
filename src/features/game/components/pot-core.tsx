'use client'

import { clsx } from 'clsx'
import type { CSSProperties, JSX } from 'react'
import { useEffect, useRef, useState } from 'react'
import type { BetActionKind } from '../types'
import { format, useDict } from '@/lib/i18n/client'
import { formatChips } from './shared'
import { ChipStack, chipBreakdown } from './game-table-chips'

export interface PotPulse {
  readonly actionId: string
  readonly action: BetActionKind
  readonly amount: number
  readonly isSelf: boolean
}

/**
 * 액션별 링 글로우 색. globals.css의 .pot-ring-pulse가 --pulse-color를 읽어
 * color-mix로 알파를 만든다 — 여기서는 토큰 이름만 넘기고 알파는 건드리지 않는다.
 */
const PULSE_COLOR: Record<BetActionKind, string> = {
  raise: 'var(--color-accent)',
  allin: 'var(--color-accent)',
  call: 'var(--color-win)',
  check: 'var(--color-muted)',
  fold: 'var(--color-muted)',
}

/**
 * 날아오는 칩의 출발 좌표(px). 인덱스로 고정 배열에서 꺼내 쓴다 — Math.random을 쓰면
 * 같은 버스트가 리렌더될 때마다 칩이 순간이동하고, SSR/CSR 결과도 갈린다.
 */
const TOSS_X = [-62, 48, -26, 74, -88] as const
const TOSS_Y = [104, 128, 92, 116, 138] as const
const TOSS_STAGGER_MS = 45

/** chip-toss 0.62s + 최대 스태거(4 × 45ms)보다 넉넉히 뒤에 정리한다. */
const BURST_LIFETIME_MS = 780

const MIN_TOSS_CHIPS = 3
const MAX_TOSS_CHIPS = 5

/**
 * 팟 숫자를 원 지름의 몇 %(cqmin)로 그릴지. 승인된 시안은 212px 원에 74px 숫자(≈35%)를 써서
 * 숫자를 화면의 주인공으로 만든다.
 *
 * 문제는 CSS에 "글자를 상자 폭에 맞춰 줄이기"가 없다는 것이다. 35%를 고정하면 "50"은 딱 맞지만
 * "12,400"·"12.3만"은 원 밖으로 삐져나간다. 그래서 렌더할 문자열의 대략적인 폭을 em으로 재서
 * 필요한 크기를 역산하고, 시안 값을 상한으로 둔다 — 짧은 숫자는 시안 그대로 크고, 긴 숫자만
 * 스스로 줄어든다.
 */
const POT_MAX_FACTOR = 35

/** 좌우 여백(px-[12%])을 뺀, 숫자가 실제로 쓸 수 있는 가로폭(지름 대비 %). 폭 추정이 어림이라 조금 깎아 둔다. */
const POT_TEXT_WIDTH = 70

/**
 * font-brush(Gungsuh 계열) tabular 숫자의 글자 폭(em). 실제 렌더 폭을 재서 맞춘 값이다 —
 * "12,400"이 3.48em, "50"이 1.25em으로 나온다. formatChips는 자릿수 외에 쉼표·소수점과
 * "만"/"K"/"M" 같은 단위도 뱉으므로 셋을 나눠 잡고, CJK 단위는 전각이라 1em으로 본다.
 */
const EM_DIGIT = 0.64
const EM_PUNCT = 0.3
const EM_UNIT = 1

function potFontFactor(text: string): number {
  let em = 0
  for (const ch of text) {
    if (ch >= '0' && ch <= '9') em += EM_DIGIT
    else if (ch === ',' || ch === '.') em += EM_PUNCT
    else em += EM_UNIT
  }
  if (em <= 0) return POT_MAX_FACTOR
  return Math.min(POT_MAX_FACTOR, POT_TEXT_WIDTH / em)
}

interface TossChip {
  readonly bg: string
  readonly rim: string
  readonly x: number
  readonly y: number
  readonly delayMs: number
}

interface Burst {
  /** 단조 증가 키. 같은 액션이 연달아 와도 remount를 강제해 애니메이션을 다시 태운다. */
  readonly key: number
  readonly action: BetActionKind
  readonly chips: readonly TossChip[]
}

/**
 * 베팅 금액을 3~5장의 칩으로 쪼갠다. 색은 chipBreakdown(공용 칩 렌더러)에서만 가져온다 —
 * 여기서 새 팔레트를 만들면 좌석/월렛 칩과 색이 갈린다.
 *
 * isSelf면 아래(양수 Y)에서 올라온다. 내가 낸 돈은 내 손에서 나가는 것처럼 보여야 해서
 * 화면 아래쪽(내 액션 바)에서 출발하고, 남의 돈은 위에서 떨어진다.
 */
function tossChipsFor(amount: number, isSelf: boolean): readonly TossChip[] {
  const palette = chipBreakdown(amount, MAX_TOSS_CHIPS)
  if (palette.length === 0) return []

  const count = Math.min(MAX_TOSS_CHIPS, Math.max(MIN_TOSS_CHIPS, palette.length))
  const chips: TossChip[] = []
  for (let i = 0; i < count; i += 1) {
    const chip = palette[i % palette.length]!
    const distance = TOSS_Y[i % TOSS_Y.length]!
    chips.push({
      bg: chip.bg,
      rim: chip.rim,
      x: TOSS_X[i % TOSS_X.length]!,
      y: isSelf ? distance : -distance,
      delayMs: i * TOSS_STAGGER_MS,
    })
  }
  return chips
}

export function PotCore({
  pot,
  carriedPot = 0,
  pulse,
  roundActive,
  className,
}: {
  pot: number

  /**
   * 재경기로 무효화된 판에서 다음 판으로 넘어갈 판돈(`docs/04-game-engines.md`). 판이 없는
   * 동안 이 값을 숫자 자리에 그린다 — 무효화 시점에는 칩이 일단 환불되므로, 여기서 0을
   * 보여주면 "판돈이 그냥 사라졌다"로 읽힌다. 판이 열리면 그 판의 팟이 이미 이월액을
   * 품고 있으므로 다시 볼 일이 없다.
   */
  carriedPot?: number

  /** null이면 연출 없음. actionId가 바뀔 때마다 한 번 연출한다 */
  pulse: PotPulse | null
  roundActive: boolean
  className?: string
}): JSX.Element {
  const { d, locale } = useDict()
  const [burst, setBurst] = useState<Burst | null>(null)
  const burstKey = useRef(0)
  const seenActionId = useRef<string | null>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  // 언마운트 때만 전부 정리한다. 버스트를 만든 effect에서 cleanup으로 타이머를 지우면
  // 700ms 안에 props가 한 번만 바뀌어도 타이머가 취소돼 칩이 영원히 남는다.
  useEffect(() => {
    const pending = timers
    return () => {
      for (const timer of pending.current) clearTimeout(timer)
      pending.current = []
    }
  }, [])

  useEffect(() => {
    if (!pulse) return
    if (pulse.actionId === seenActionId.current) return
    seenActionId.current = pulse.actionId

    // 판이 안 열렸으면 seen만 갱신하고 연출은 건너뛴다 — 그래야 roundActive가 뒤늦게
    // true로 바뀔 때 지나간 액션이 되살아나 터지지 않는다.
    if (!roundActive) return

    burstKey.current += 1
    const key = burstKey.current
    const next: Burst = {
      key,
      action: pulse.action,
      chips: pulse.amount > 0 ? tossChipsFor(pulse.amount, pulse.isSelf) : [],
    }
    setBurst(next)

    const timer = setTimeout(() => {
      // 뒤이어 온 버스트를 지우지 않도록 자기 것일 때만 비운다.
      setBurst((current) => (current && current.key === key ? null : current))
    }, BURST_LIFETIME_MS)
    timers.current = [...timers.current, timer]
  }, [pulse, roundActive])

  const showCarried = !roundActive && carriedPot > 0
  const displayPot = showCarried ? carriedPot : pot
  const potText = formatChips(displayPot, locale)
  const ringStyle: CSSProperties | undefined = burst
    ? ({ '--pulse-color': PULSE_COLOR[burst.action] } as CSSProperties)
    : undefined

  // gilt가 깔아 둔 검은 그림자는 남기고 시안의 금색 헤일로를 한 겹 더 얹는다. 금색 리터럴 대신
  // --color-gold를 color-mix로 흐리게 쓴다 — 토큰이 바뀔 때 여기만 옛 금색으로 남지 않게.
  const numberStyle: CSSProperties = {
    // 하한을 1rem까지 낮춘다. 가로로 납작한 상자에선 원이 90px까지 작아지는데, 하한이 높으면
    // 하한이 이겨서 계산된 크기를 무시하고 글자가 원 밖으로 나간다.
    fontSize: `clamp(1rem, ${potFontFactor(potText)}cqmin, 5.5rem)`,
    textShadow:
      '0 1px 0 rgb(0 0 0 / 0.5), 0 2px 18px color-mix(in srgb, var(--color-gold) 30%, transparent)',
  }

  return (
    <div
      className={clsx(
        // [container-type:size]가 있어야 안쪽에서 cqmin으로 원 지름을 잡는다.
        'relative flex min-h-0 min-w-0 items-center justify-center [container-type:size]',
        className,
      )}
    >
      <div
        className={clsx(
          // min(…cqw,…cqh)로 짧은 쪽에 맞춘다 — aspect-square와 함께 어떤 비율의 상자에
          // 넣어도 타원이 되지 않고, 넘치지도 않는다. cqw만 쓰면 납작한 상자에서 넘친다.
          //
          // 100%가 아니라 78%인 건 시안이 요구하는 여백이다. 승인된 시안은 374×437 스테이지에
          // 212px 원을 놓아 원 둘레에 확실한 숨 쉴 공간을 남긴다. 14rem 상한은 태블릿에서
          // 원이 화면만큼 부풀지 않게 잡아 준다. 세로만 92%로 더 쓰는 건 가로 landscape에서
          // 높이가 귀하기 때문이다 — 여백은 남는 가로축에서 벌면 된다.
          //
          // 원 자신도 컨테이너로 만든다. 그래야 안쪽 글자·간격의 cqmin이 바깥 상자가 아니라
          // "원 지름"을 기준으로 풀려서, 시안의 비율(212px 원에 74px 숫자 = 35%)을 상자 크기와
          // 무관하게 그대로 옮길 수 있다. container-type:size는 paint containment를 걸지 않아서
          // 펄스 글로우와 날아드는 칩이 원 밖으로 나가는 건 그대로다.
          'relative aspect-square w-[min(78cqw,92cqh,14rem)] max-h-full max-w-full [container-type:size]',
          'transition-opacity duration-300',
          roundActive ? 'opacity-100' : 'opacity-60 saturate-[0.55]',
        )}
      >
        {/*
          시안의 "펠트 메달" 3겹 구조. 바깥 얇은 금테 → 어두운 띠 → 안쪽 펠트 원반 순으로 겹쳐
          평평한 원이 아니라 테이블에 박힌 판처럼 읽히게 한다. 바깥 테는 지름 전체(inset-0)를
          쓰고 펠트를 4.5% 안으로 밀어 그 사이에 어두운 띠가 드러난다.
        */}
        <div
          aria-hidden
          className="absolute inset-0 rounded-full border border-gold/35 bg-bg-deep/70"
        />

        {/*
          펠트 원반. 그림자를 여기 두고 펄스 링은 따로 얹는다 — .pot-ring-pulse가 box-shadow를
          통째로 덮어써서 같은 요소에 걸면 0.6s 동안 안쪽 그림자가 사라진다.
        */}
        <div
          aria-hidden
          className="absolute inset-[4.5%] rounded-full border border-gold/30 bg-[radial-gradient(circle_at_50%_38%,#23533d_0%,#12301f_68%,#0b2015_100%)] shadow-[inset_0_2px_24px_rgb(0_0_0/0.55),0_20px_50px_-24px_rgb(0_0_0/0.95)]"
        />

        {/* 펠트 안쪽 헤어라인. 금테를 한 번 더 되울려 메달 느낌을 잡는다. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-[12%] rounded-full border border-gold/10"
        />

        {/*
          key가 바뀌면 React가 노드를 갈아끼워 애니메이션이 처음부터 다시 돈다.
          같은 종류의 액션이 연달아 들어와도 두 번 다 튀는 이유가 이것이다.
        */}
        {burst ? (
          <div
            key={burst.key}
            aria-hidden
            style={ringStyle}
            className="pot-ring-pulse pointer-events-none absolute inset-0 rounded-full"
          />
        ) : null}

        <div
          aria-hidden
          className="absolute inset-0 flex flex-col items-center justify-center gap-[0.5cqmin] px-[12%] text-center"
        >
          {/*
            -mr는 광학 보정이다. tracking을 크게 주면 마지막 글자 뒤에도 자간이 붙어 상자가
            그만큼 넓어지고, items-center로 가운데를 맞춰도 글자가 왼쪽으로 밀려 보인다.
          */}
          <p className="-mr-[0.34em] text-[clamp(0.5625rem,4.5cqmin,0.75rem)] font-semibold uppercase leading-none tracking-[0.34em] text-gold/60">
            {d.table.potLabel}
          </p>

          {/*
            burst가 없을 때도 숫자는 그대로 그린다 — prefers-reduced-motion에서 애니메이션이
            아예 안 돌아도 최종 상태가 맞아야 한다.
          */}
          <p
            key={burst ? burst.key : 'idle'}
            style={numberStyle}
            className={clsx(
              'gilt font-brush font-black whitespace-nowrap tabular-nums',
              'leading-[0.92]',
              burst && 'pot-bump',
            )}
          >
            {potText}
          </p>

          {/*
            숫자 아래 muted 한 줄. 판이 열려 있으면 시안 그대로 "누적 베팅"을, 안 열렸으면
            대기 문구를 같은 자리에 놓는다 — 줄이 사라졌다 나타나면 원 안 무게중심이 흔들린다.
            둘 다 장식이고, 읽어 주는 건 아래 sr-only aria-live 한 곳뿐이다.
          */}
          <p className="-mr-[0.1em] mt-[2.8cqmin] text-[clamp(0.5625rem,4.7cqmin,0.75rem)] leading-none tracking-[0.1em] text-muted/70">
            {roundActive
              ? d.table.potSubLabel
              : showCarried
                ? d.table.potCarriedLabel
                : d.rail.roundIdle}
          </p>

          {/*
            칩 줄은 원 밖에 떠 있지 않고 펠트 안쪽, 라벨 아래에 앉는다. 시안처럼 bottom 고정
            absolute로 띄우지 않고 같은 컬럼 안에 흘려 둔다 — ChipStack 높이는 px 고정(칩 장수에
            비례)이라, 원이 작아지면 absolute로는 라벨을 덮어 버린다. 흐름 안에 있으면 컬럼이
            같이 커지고 가운데 정렬이 다시 잡혀서 어떤 크기에서도 겹치지 않는다.
          */}
          {displayPot > 0 ? (
            <span className="mt-[6cqmin] block">
              <ChipStack amount={displayPot} size={14} />
            </span>
          ) : null}
        </div>

        {/*
          grid로 가운데 정렬한다. absolute + -translate-x-1/2로 맞추면 .chip-toss의
          transform이 그 정렬을 덮어써서 칩이 엉뚱한 데서 멈춘다.
        */}
        {burst && burst.chips.length > 0 ? (
          <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
            {burst.chips.map((chip, i) => (
              <span
                key={`${burst.key}-${i}`}
                className="chip-toss pointer-events-none col-start-1 row-start-1 block h-5 w-5 rounded-full border-2 border-dashed"
                style={
                  {
                    '--toss-x': `${chip.x}px`,
                    '--toss-y': `${chip.y}px`,
                    animationDelay: `${chip.delayMs}ms`,
                    backgroundColor: chip.bg,
                    borderColor: chip.rim,
                    boxShadow: '0 2px 3px rgb(0 0 0 / 0.55)',
                  } as CSSProperties
                }
              />
            ))}
          </div>
        ) : null}
      </div>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {format(d.room.potAnnounce, { n: potText })}
      </p>
    </div>
  )
}
