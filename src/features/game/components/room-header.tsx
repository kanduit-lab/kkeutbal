'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Badge, Button, ButtonLink, useIsDesktop } from '@/components/ui'
import { format, useDict } from '@/lib/i18n/client'
import type { RoomSnapshot } from '../types'
import { RoomMenuSheet } from './room-menu-sheet'

export function RoomHeader({
  snapshot,
  isHost,
  muted,
  onToggleMute,
  onOpenAdvisor,
}: {
  snapshot: RoomSnapshot
  isHost: boolean
  muted: boolean
  onToggleMute: () => void
  onOpenAdvisor: () => void
}) {
  const { d } = useDict()
  const isDesktop = useIsDesktop()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="rise-in mb-4 flex items-center gap-3 lg:mb-8">
      {/*
        `flex-wrap`을 뺐다. 아이콘 5개가 272px이라 360px 화면에서는 제목 줄과 같은 줄에
        못 들어가 헤더가 늘 두 줄로 접혔고, 둘째 줄에는 라벨 없는 이모지 띠만 남았다.
        세로 화면은 [🔊][⋯] 두 개만 두고 나머지는 메뉴 시트로 내린다.
      */}
      <Link
        href="/"
        aria-label={d.room.backAria}
        className="-ms-2 inline-flex size-12 shrink-0 items-center justify-center rounded-xl text-xl text-muted transition-colors hover:text-text"
      >
        ←
      </Link>
      {/*
        정확히 두 줄로 고정한다. 예전에는 제목 아래 한 줄에 "코드 · 게임 · 입력방식 + 상태
        뱃지"를 `flex-wrap`으로 몰아넣어서, 폰 폭에서는 뱃지가 셋째 줄로 밀려 헤더가 3단이
        됐다 — 뒤로가기 화살표가 제목이 아니라 둘째 줄 옆에 붙어 보이던 것도 이 때문이다.
        상태 뱃지는 제목 줄로 올리고, 메타는 줄바꿈 없이 넘치면 자른다.
      */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h1 className="min-w-0 truncate font-brush text-xl font-bold leading-tight lg:text-3xl">
            {snapshot.room.name}
          </h1>
          <Badge tone={snapshot.currentRound ? 'win' : 'muted'}>
            {snapshot.currentRound
              ? format(d.room.roundLive, { seq: snapshot.currentRound.seq })
              : d.common.waiting}
          </Badge>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted lg:text-sm">
          {d.room.codeLabel}{' '}
          <span className="font-mono font-bold tracking-widest">{snapshot.room.code}</span>
          {' · '}
          {d.games[snapshot.room.gameType]}
          {' · '}
          {snapshot.room.inputMode === 'trust' ? d.inputMode.trust : d.inputMode.approval}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {/* 음소거는 메뉴에 넣지 않는다 — 상태(🔇/🔊)가 곧 표시라, 한 번 열어봐야 알 수 있게
            되면 지금 소리가 켜져 있는지 화면에서 사라진다. */}
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onToggleMute}
          aria-pressed={muted}
          aria-label={muted ? d.room.soundOnAria : d.room.soundOffAria}
          title={muted ? d.room.soundOnAria : d.room.soundOffAria}
          suppressHydrationWarning
        >
          {muted ? '🔇' : '🔊'}
        </Button>

        {isDesktop ? (
          <>
            <ButtonLink
              href={`/rooms/${snapshot.room.code}/result`}
              variant="outline"
              size="icon"
              aria-label={d.room.resultAria}
              title={d.room.resultAria}
            >
              🧾
            </ButtonLink>
            {/* 방을 떠나지 않고 연다. 판독하러 `/advisor`로 나가면 실시간 채널이 끊기고
                돌아왔을 때 스냅샷을 다시 받아야 한다. */}
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={onOpenAdvisor}
              aria-label={d.room.advisorAria}
              title={d.room.advisorAria}
            >
              🔮
            </Button>
            <ButtonLink
              href={`/rooms/${snapshot.room.code}/monitor`}
              variant="outline"
              size="icon"
              aria-label={d.room.monitorAria}
              title={d.room.monitorTitle}
            >
              📺
            </ButtonLink>
            {/* 판 기록 버튼은 여기 없다. 세로 모바일은 노선도(TurnRailBar)가 액션 수 뱃지까지
                달린 📋 를 갖고 있어 헤더에 또 두면 같은 화면에 같은 아이콘이 둘이 된다.
                데스크톱은 우측 컬럼에 기록이 항상 펼쳐져 있어 여는 버튼 자체가 필요 없다. */}
            {isHost ? (
              <ButtonLink
                href={`/rooms/${snapshot.room.code}/settings`}
                variant="outline"
                size="icon"
                aria-label={d.room.settingsAria}
                title={d.room.settingsTitle}
              >
                ⚙️
              </ButtonLink>
            ) : null}
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            aria-label={d.room.menuAria}
            title={d.room.menuTitle}
            onClick={() => setMenuOpen(true)}
          >
            ⋯
          </Button>
        )}
      </div>

      <RoomMenuSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        code={snapshot.room.code}
        isHost={isHost}
        onOpenAdvisor={onOpenAdvisor}
      />
    </header>
  )
}
