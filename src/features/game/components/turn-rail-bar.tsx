'use client'

import { clsx } from 'clsx'
import { Button } from '@/components/ui'
import { format, useDict } from '@/lib/i18n/client'
import type { Dictionary, Locale } from '@/lib/i18n/client'
import type { RailAction, TurnRail } from '../turn-rail'
import type { BetActionKind, MemberView, RoomGameType } from '../types'
import { betLabelsFor, formatChips } from './shared'

/**
 * 턴 노선도 — 세로 모바일 베팅 화면 맨 위 한 줄.
 *
 * 좌석을 원형으로 깔던 예전 화면은 폰에서 이름 한 글자도 못 읽을 만큼 좁았다. 대신 지금
 * 판단에 필요한 세 가지(직전에 무슨 일이 있었나 / 지금 누구 차례인가 / 그 다음은 누구인가)만
 * 지하철 노선도처럼 한 줄로 세운다.
 *
 * 시안대로 "선이 먼저, 점이 그 위에" 구조다. 가로선 하나가 척추고 정거장 세 개가 그 선에
 * 얹힌다. 라벨은 선 위에, 값(이름 + 액션)은 선 아래에 놓아 선이 시선의 기준선이 된다.
 * 아바타는 싣지 않는다 — 320px에서 아바타 28px은 가운데 칸 폭의 절반을 먹고, 이름이 이미
 * 같은 정보를 준다.
 *
 * 차례 계산은 하지 않는다 — `turnRail()`이 이미 만든 값을 받아 그리기만 한다. 여기서 다시
 * 계산하면 서버가 강제하는 차례와 화면이 갈라진다.
 */

/**
 * 액션별 색. 판단을 색으로 먼저 전달한다 — 콜은 무난(win), 레이즈·올인은 압박(accent),
 * 다이는 이미 끝난 정보(muted), 체크는 아무 일도 안 일어난 것(기본 텍스트색).
 * 라벨 문자열 자체는 게임마다 달라서 `betLabelsFor`가 정하고, 여기서는 색만 정한다.
 */
const ACTION_TONE: Record<BetActionKind, string> = {
  check: 'text-text',
  call: 'text-win',
  raise: 'text-accent',
  allin: 'text-accent',
  fold: 'text-muted',
}

/**
 * 정거장 한 칸의 5줄 격자. 줄마다 높이를 못 박아서 어떤 상태(직전 없음 / 승인 대기 / 판 대기 /
 * 전원 종료 / 내 차례)에서도 레일 전체 높이가 h-18(72px)로 고정된다 — 상단 바가 판마다
 * 들썩이면 그 아래 베팅 버튼 위치가 흔들려 오조작으로 이어진다.
 *
 * 16 + 16 + 20 + 16 + 4 = 72 = h-18. 가운데 칸만 이름·액션 줄을 h-9(20+16)로 합쳐 쓰는데,
 * 합쳐도 합계가 같아서 높이 보장은 그대로다.
 */
const LABEL_ROW = 'flex h-4 min-w-0 items-center justify-center'
const DOT_ROW = 'flex h-4 items-center justify-center'
const NAME_ROW = 'flex h-5 min-w-0 items-center justify-center'
const ACT_ROW = 'flex h-4 min-w-0 items-center justify-center gap-1 overflow-hidden'
/** 밑줄 바 줄. 바는 현재 정거장에만 뜨지만 줄 자체는 세 칸 모두 차지해 바닥선을 맞춘다. */
const BAR_ROW = 'flex h-1 items-center justify-center'

/**
 * 선 위 라벨. 작게·자간 넓게 — 값이 아니라 칸 이름이라는 신호를 크기로 준다.
 * 색은 일부러 안 넣는다. 같은 CSS 속성을 건드리는 유틸리티를 두 개 겹치면 어느 쪽이 이기는지
 * 클래스 문자열 순서가 아니라 생성된 스타일시트 순서가 정해서 상태별 색이 뒤집힐 수 있다.
 */
const LABEL = 'min-w-0 truncate text-micro font-medium uppercase tracking-widest'

/**
 * 세 칸 모두 같은 폭(basis-0 + grow). 균등해야 점이 정확히 1/6·1/2·5/6 지점에 서고,
 * 그래야 아래 실선이 끝나는 `right-1/2`가 가운데 점 정중앙과 맞는다. 여기 비율을 건드리면
 * 선과 점이 어긋난다.
 *
 * 칸 사이 여백은 `gap`이 아니라 칸 안쪽 `px-1`로 준다. gap은 칸 폭을 줄여 바깥 점 두 개를
 * 안쪽으로 당기지만, padding은 칸 경계를 그대로 두고 글자만 물러나게 해서 점 위치가 안 흔들린다.
 * 그리고 padding은 글자가 잡아먹을 수 없는 여백이라 320px에서 긴 이름 둘이 맞붙지 않는다.
 */
const STOP = 'flex h-full min-w-0 shrink basis-0 grow flex-col px-1'

/**
 * 지나온 구간 — 이미 확정돼 되돌릴 수 없는 액션이라 실선에 금색, 은은한 발광까지 준다.
 * 색은 리터럴 대신 --color-gold를 color-mix로 섞어 쓴다. 여기만 옛 금색으로 남지 않게.
 */
const SOLID_PAINT: React.CSSProperties = {
  backgroundColor: 'color-mix(in srgb, var(--color-gold) 55%, transparent)',
  boxShadow: '0 0 10px color-mix(in srgb, var(--color-gold) 28%, transparent)',
}

/**
 * 앞으로 갈 구간 — 아직 아무것도 정해지지 않았다는 뜻으로 점선. 실선/점선의 이 대비가
 * 노선도의 핵심 의미라서, `border-dashed`(대시 길이가 브라우저마다 다름) 대신
 * 6px 칠하고 4px 비우는 gradient로 리듬을 못 박는다. Tailwind에 대응 유틸리티가 없어 인라인.
 */
const DASHED_PAINT: React.CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(90deg, color-mix(in srgb, var(--color-gold) 30%, transparent) 0 6px, transparent 6px 10px)',
}

/**
 * 노선의 한 구간. `top-4`(라벨 줄 h-4 다음) + `h-4`(점 줄과 같은 높이) + 세로 가운데 정렬이라
 * 픽셀을 손으로 세지 않고도 선 한 줄과 점 세 개가 정확히 한 직선이 된다.
 */
function RailSegment({ dashed, className }: { dashed?: boolean; className: string }) {
  return (
    <span className={clsx('absolute top-4 flex h-4 items-center', className)}>
      <span className="h-0.5 w-full rounded-full" style={dashed ? DASHED_PAINT : SOLID_PAINT} />
    </span>
  )
}

/** 노선의 정거장 표시. 지나온 칸은 채움, 지금 칸은 크게 채우고 발광, 다음 칸은 빈 고리. */
function StopDot({ tone, glow }: { tone: 'past' | 'now' | 'next'; glow?: boolean }) {
  return (
    <span className={clsx(DOT_ROW, 'relative')}>
      {/*
        후광. `.turn-glow`가 box-shadow 전체를 애니메이션해서 ring 유틸리티와 같은 속성을 두고
        싸운다 — 그래서 링을 겹치지 않고 별도 원으로 뒤에 깐다. absolute라 줄 높이는 안 건드린다.
      */}
      {glow ? <span className="absolute size-6 rounded-full bg-gold/15" /> : null}
      <span
        className={clsx(
          'relative shrink-0 rounded-full',
          glow && 'turn-glow',
          tone === 'past' && 'size-2.5 bg-gold/55',
          tone === 'now' && 'size-3.5 bg-gold',
          // 빈 고리 안쪽을 배경색으로 막아야 아래 지나가는 선이 비쳐 보이지 않는다
          tone === 'next' && 'size-2.5 border-2 border-gold/35 bg-bg-deep',
        )}
      />
    </span>
  )
}

function resolveName(
  members: readonly MemberView[],
  userId: string | null,
  selfId: string,
  d: Dictionary,
): string {
  if (!userId) return d.rail.none
  if (userId === selfId) return d.common.me
  return members.find((member) => member.userId === userId)?.displayName ?? d.common.unknownPlayer
}

/** 스크린리더 요약용 한 줄 표현. 금액은 0이면 아예 빼서 "콜 0" 같은 잡음을 안 만든다. */
function describeAction(
  action: RailAction,
  name: string,
  labels: Record<BetActionKind, string>,
  locale: Locale,
): string {
  const amount = action.amount > 0 ? formatChips(action.amount, locale) : null
  return [name, labels[action.action], amount].filter(Boolean).join(' ')
}

function PreviousStop({
  action,
  isPending,
  name,
  labels,
  locale,
  d,
}: {
  action: RailAction | null
  isPending: boolean
  name: string
  labels: Record<BetActionKind, string>
  locale: Locale
  d: Dictionary
}) {
  return (
    <div
      className={clsx(STOP, 'rail-enter')}
      style={{ '--rail-from': '-14px' } as React.CSSProperties}
    >
      <span className={LABEL_ROW}>
        {/*
          승인 대기일 때는 칸 이름 자리를 '승인 대기'가 가져간다. 라벨 옆에 Badge를 덧붙이면
          알약 높이(≈24px)가 h-4 줄을 밀어 레일 전체가 커진다 — 높이 고정이 먼저다.
          위치(맨 왼쪽 정거장)가 이미 "이전"을 말하고 있어 라벨을 바꿔도 뜻이 흐려지지 않는다.
        */}
        <span className={clsx(LABEL, isPending ? 'text-warn' : 'text-muted')}>
          {isPending ? d.rail.pending : d.rail.previous}
        </span>
      </span>
      <StopDot tone="past" />
      <span className={NAME_ROW}>
        <span
          className={clsx(
            'min-w-0 truncate text-xs',
            action ? 'font-semibold text-muted' : 'text-muted/60',
          )}
        >
          {action ? name : d.rail.none}
        </span>
      </span>
      <span className={ACT_ROW}>
        {action ? (
          <>
            <span
              className={clsx(
                'min-w-0 truncate text-micro font-bold',
                // 승인 대기는 아직 칩이 움직이지 않았다 — 확정된 액션과 같은 색으로 보이면
                // 이미 낸 돈으로 오해한다. 그래서 톤을 죽이고 라벨로만 상태를 알린다.
                isPending ? 'text-muted' : ACTION_TONE[action.action],
              )}
            >
              {labels[action.action]}
            </span>
            {action.amount > 0 ? (
              // 숫자는 안 줄인다 — 금액이 잘리면 판단이 틀어진다. 대신 왼쪽 라벨이 먼저 줄어든다.
              <span
                className={clsx(
                  'shrink-0 text-micro tabular-nums',
                  isPending ? 'text-muted' : 'text-warn',
                )}
              >
                {formatChips(action.amount, locale)}
              </span>
            ) : null}
          </>
        ) : null}
      </span>
      <span className={BAR_ROW} />
    </div>
  )
}

function CurrentStop({
  currentId,
  isSelf,
  isAllDone,
  name,
  d,
}: {
  currentId: string | null
  isSelf: boolean
  isAllDone: boolean
  name: string
  d: Dictionary
}) {
  return (
    <div
      className={clsx(
        STOP,
        // 다음 칸이 사라진 상태(더 행동할 사람 없음)에서는 가운데가 남은 폭을 가져간다 —
        // '더 행동할 사람이 없어요'가 두 줄로라도 들어가야 해서다.
        // 주의: 이 1:2 비율이 곧 실선 끝점 `right-1/3`(= 지금 점 중심 2/3)의 근거다. 여기를
        // 바꾸면 위 RailSegment의 끝점도 같이 바꿔야 선이 점에서 안 어긋난다.
        isAllDone && 'grow-[2]',
      )}
    >
      <span className={LABEL_ROW}>
        {/* 지금 칸만 라벨까지 금색 — 시선이 가운데로 먼저 떨어지게 하는 앵커다 */}
        <span className={clsx(LABEL, isAllDone ? 'text-muted' : 'text-gold/80')}>
          {d.rail.current}
        </span>
      </span>
      <StopDot tone="now" glow={!isAllDone} />
      {/*
        가로 정렬은 안쪽 줄들이 각자 `justify-center`로 한다. 여기에 `items-center`를 걸면
        줄들이 stretch를 잃고 내용만큼만 넓어져서 `truncate`가 죽는다 — 320px에서 긴 이름이
        옆 칸을 밟고 넘어간다. 그래서 교차축은 기본값(stretch) 그대로 둔다.
      */}
      <span
        key={currentId ?? 'none'}
        className="rail-enter flex min-w-0 flex-col"
        style={{ '--rail-from': '6px' } as React.CSSProperties}
      >
        {isAllDone ? (
          // 문구가 길어서 한 줄로는 못 담는다 — 이름 줄과 액션 줄을 합친 h-9에 두 줄로 눕힌다.
          <span className="flex h-9 items-center px-0.5 text-center text-micro leading-4 text-muted">
            <span className="line-clamp-2">{d.rail.allDone}</span>
          </span>
        ) : (
          <>
            <span className={NAME_ROW}>
              {isSelf ? (
                // 내 차례는 이 화면에서 가장 강한 신호다 — 유일하게 금색 + 한 단계 큰 글자
                <span className="min-w-0 truncate text-base font-black leading-5 text-gold">
                  {d.rail.yourTurn}
                </span>
              ) : (
                <span className="min-w-0 truncate text-sm font-black leading-5">{name}</span>
              )}
            </span>
            <span className={ACT_ROW}>
              <span className="min-w-0 truncate text-micro font-bold text-gold/80">
                {d.rail.waiting}
              </span>
            </span>
          </>
        )}
      </span>
      <span className={BAR_ROW}>
        {/* 지금 칸을 시각적으로 못 박는 짧은 밑줄. 전원 종료 상태에는 붙잡을 차례가 없으니 뺀다 */}
        {isAllDone ? null : <span className="h-0.5 w-8 rounded-full bg-gold/70" />}
      </span>
    </div>
  )
}

function NextStop({ name, hasNext, d }: { name: string; hasNext: boolean; d: Dictionary }) {
  return (
    <div
      className={clsx(STOP, 'rail-enter')}
      style={{ '--rail-from': '14px' } as React.CSSProperties}
    >
      <span className={LABEL_ROW}>
        <span className={clsx(LABEL, 'text-muted')}>{d.rail.next}</span>
      </span>
      <StopDot tone="next" />
      <span className={NAME_ROW}>
        <span
          className={clsx(
            'min-w-0 truncate text-xs',
            hasNext ? 'font-semibold text-muted' : 'text-muted/60',
          )}
        >
          {hasNext ? name : d.rail.none}
        </span>
      </span>
      <span className={ACT_ROW}>
        <span className="min-w-0 truncate text-micro text-muted/70">{d.rail.waiting}</span>
      </span>
      <span className={BAR_ROW} />
    </div>
  )
}

export function TurnRailBar({
  rail,
  members,
  selfId,
  gameType,
  historyCount,
  onOpenHistory,
  className,
}: {
  rail: TurnRail
  members: readonly MemberView[]
  selfId: string
  gameType: RoomGameType

  /** 전체 기록 버튼에 붙는 뱃지 숫자(이번 판 액션 수) */
  historyCount: number
  onOpenHistory: () => void
  className?: string
}): React.JSX.Element {
  const { d, locale } = useDict()
  const labels = betLabelsFor(gameType, d)

  // 승인 대기 액션이 있으면 그게 "직전에 벌어진 일"이다. 다만 확정된 게 아니라서 아래에서
  // 라벨과 톤으로 구분한다.
  const spotlight = rail.pending ?? rail.previous
  const isPending = rail.pending !== null

  // 판 자체가 없으면 turnRail이 전부 null을 준다. 반대로 판은 도는데 현재 차례만 없으면
  // 전원 다이·올인으로 더 행동할 사람이 없는 상태다 — 두 경우의 안내 문구가 다르다.
  const isIdle = rail.currentId === null && spotlight === null
  const isAllDone = !isIdle && rail.currentId === null

  const isSelfTurn = rail.currentId !== null && rail.currentId === selfId

  const previousName = spotlight ? resolveName(members, spotlight.userId, selfId, d) : d.rail.none
  const currentName = resolveName(members, rail.currentId, selfId, d)
  const nextName = resolveName(members, rail.nextId, selfId, d)

  const previousText = spotlight
    ? [describeAction(spotlight, previousName, labels, locale), isPending ? d.rail.pending : null]
        .filter(Boolean)
        .join(' ')
    : d.rail.none
  const currentText = isAllDone ? d.rail.allDone : isSelfTurn ? d.rail.yourTurn : currentName
  const summary = isIdle
    ? d.rail.roundIdle
    : format(d.rail.ariaSummary, {
        prev: previousText,
        current: currentText,
        next: nextName,
      })

  return (
    <section className={clsx('lacquer flex items-center gap-2 rounded-2xl px-3 py-2', className)}>
      {/*
        시각 정거장은 전부 aria-hidden으로 덮고, 대신 여기 한 줄만 읽힌다. 세 칸을 각각
        읽히면 순서가 바뀔 때마다 세 번 떠들어서 오히려 상황 파악이 어렵다.
      */}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {summary}
      </p>
      <div aria-hidden className="relative h-18 min-w-0 flex-1">
        {isIdle ? (
          <div className="flex h-full flex-col justify-center">
            <span className="truncate text-sm font-bold text-muted">{d.rail.roundIdle}</span>
            <span className="truncate text-micro text-muted/70">{d.rail.idleHint}</span>
          </div>
        ) : (
          <>
            {/*
              노선 자체. 바깥쪽을 점 중심(1/6·5/6)보다 조금 더 뻗어(8%) 선이 화면 밖으로
              계속 이어지는 노선처럼 보이게 한다.

              실선은 지나온 구간(직전 → 지금), 점선은 아직 안 온 구간(지금 → 다음)이다.
              더 행동할 사람이 없으면 미래 구간 자체가 없으므로 점선을 없애고 실선 하나만 남긴다.
              이때 오른쪽 끝은 바깥으로 안 뻗고 지금 점에서 딱 끊는다 — 선이 점 너머로 이어지면
              아직 올 사람이 있는 것처럼 읽힌다. 두 칸이 1:2라 지금 점 중심이 정확히 2/3다.
            */}
            <RailSegment className={isAllDone ? 'left-[8%] right-1/3' : 'left-[8%] right-1/2'} />
            {isAllDone ? null : <RailSegment dashed className="left-1/2 right-[8%]" />}

            {/* 정거장은 선보다 뒤에 놓아 점이 선 위에 얹히게 한다 */}
            <div className="relative flex h-full items-stretch">
              <PreviousStop
                key={spotlight?.id ?? 'none'}
                action={spotlight}
                isPending={isPending}
                name={previousName}
                labels={labels}
                locale={locale}
                d={d}
              />
              <CurrentStop
                currentId={rail.currentId}
                isSelf={isSelfTurn}
                isAllDone={isAllDone}
                name={currentName}
                d={d}
              />
              {isAllDone ? null : (
                <NextStop
                  key={rail.nextId ?? 'none'}
                  name={nextName}
                  hasNext={rail.nextId !== null}
                  d={d}
                />
              )}
            </div>
          </>
        )}
      </div>
      <div className="relative shrink-0">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={d.betHistory.openAria}
          onClick={onOpenHistory}
        >
          📋
        </Button>
        {historyCount > 0 ? (
          // 뱃지는 절대 위치라 48×48 터치 타깃을 줄이지 않는다
          <span
            aria-hidden
            className="pointer-events-none absolute -right-1 -top-1 min-w-5 rounded-md bg-accent px-1 text-center text-micro font-bold leading-5 tabular-nums text-white"
          >
            {historyCount}
          </span>
        ) : null}
      </div>
    </section>
  )
}
