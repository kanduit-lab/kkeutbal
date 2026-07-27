'use client'

import Link from 'next/link'
import { Badge } from '@/components/ui'
import { format, useDict } from '@/lib/i18n/client'
import type { RoomSnapshot } from '../types'

// 48px 터치 타깃 안에서 아이콘이 너무 작으면 빈 상자처럼 보인다 — 글리프를 키우고
// 옅은 배경을 깔아 네 개가 한 묶음으로 읽히게 한다.
const ICON_LINK_CLASS =
  'inline-flex min-h-12 min-w-12 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-lg leading-none transition-colors hover:border-gold/40 hover:bg-white/10'

/**
 * 방 헤더 — 뒤로가기·방 이름·상태 뱃지 + 아이콘 줄(음소거·결과·전광판·설정).
 *
 * 아이콘 줄에는 조건부로 나타나는 요소를 두지 않는다. 연결 경고는 RoomConnectionBar 가
 * 헤더 바깥 전용 슬롯에서 담당한다 — 여기에 끼워 넣으면 소켓이 깜빡일 때마다
 * 아이콘이 통째로 밀려 오탭을 만든다.
 */
export function RoomHeader({
  snapshot,
  isHost,
  muted,
  onToggleMute,
}: {
  snapshot: RoomSnapshot
  isHost: boolean
  muted: boolean
  onToggleMute: () => void
}) {
  const { d } = useDict()
  return (
    <header className="rise-in mb-5 flex items-center justify-between lg:mb-8">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href="/"
          aria-label={d.room.backAria}
          className="inline-flex min-h-12 min-w-12 items-center justify-center text-xl text-muted transition-colors hover:text-text"
        >
          ←
        </Link>
        <div className="min-w-0">
          <h1 className="truncate font-brush text-xl font-bold leading-tight lg:text-3xl">
            {snapshot.room.name}
          </h1>
          {/* 판 진행 상태는 방 정보와 같은 줄에 둔다 — 아이콘 버튼(48px) 옆에 두면
              뱃지 높이가 맞지 않아 헤더가 들쭉날쭉해진다. */}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted lg:text-sm">
            <span>
              {d.room.codeLabel}{' '}
              <span className="font-mono font-bold tracking-widest">{snapshot.room.code}</span>
              {' · '}
              {d.games[snapshot.room.gameType]}
              {' · '}
              {snapshot.room.inputMode === 'trust' ? d.inputMode.trust : d.inputMode.approval}
            </span>
            <Badge tone={snapshot.currentRound ? 'win' : 'muted'}>
              {snapshot.currentRound
                ? format(d.room.roundLive, { seq: snapshot.currentRound.seq })
                : d.common.waiting}
            </Badge>
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {/* 서버 렌더는 항상 muted(🔇) — localStorage 값과 다를 수 있어 경고만 억제한다. */}
        <button
          type="button"
          onClick={onToggleMute}
          aria-pressed={muted}
          aria-label={muted ? d.room.soundOnAria : d.room.soundOffAria}
          suppressHydrationWarning
          className={ICON_LINK_CLASS}
        >
          {muted ? '🔇' : '🔊'}
        </button>
        <Link
          href={`/rooms/${snapshot.room.code}/result`}
          aria-label={d.room.resultAria}
          title={d.room.resultAria}
          className={ICON_LINK_CLASS}
        >
          🧾
        </Link>
        <Link
          href={`/rooms/${snapshot.room.code}/monitor`}
          aria-label={d.room.monitorAria}
          title={d.room.monitorTitle}
          className={ICON_LINK_CLASS}
        >
          📺
        </Link>
        {isHost ? (
          <Link
            href={`/rooms/${snapshot.room.code}/settings`}
            aria-label={d.room.settingsAria}
            title={d.room.settingsTitle}
            className={ICON_LINK_CLASS}
          >
            ⚙️
          </Link>
        ) : null}
      </div>
    </header>
  )
}
