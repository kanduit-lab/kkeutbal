'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { useCallback, useMemo, useState } from 'react'
import { format, useDict } from '@/lib/i18n/client'
import { isMuted, setMuted } from '@/lib/sound'
import type { MemberView, RoomSnapshot } from '../types'
import { Button, Sheet, useIsDesktop, useToast } from '@/components/ui'
import { RoomHeader } from './room-header'
import { RoomConnectionBar } from './room-connection-bar'
import { GameTable } from './game-table'
import { TurnRailBar } from './turn-rail-bar'
import { PotCore } from './pot-core'
import { SelfBar } from './self-bar'
import { BetHistorySheet } from './bet-history-sheet'
import { turnRail } from '../turn-rail'
import { useBetPulse } from './use-bet-pulse'
import { ActionBar } from './action-bar'
import { DealerPanel } from './dealer-panel'
import { DealerQuickBar } from './dealer-quick-bar'
import { GostopWaitPanel } from './gostop-wait-panel'
import { ObserverStatusPanel } from './observer-status-panel'
import { LobbyPanel } from './lobby-panel'
import { MemberSheet } from './member-sheet'
import { MemberListSheet } from './member-list-sheet'
import { RoundLog } from './round-log'
import { FairnessPanel } from './fairness-panel'
import { AdvisorBoard } from '@/features/jokbo-advisor/components/advisor-board'
import { useRoomActions } from './use-room-actions'

export function RoomClient({
  initial,
  selfId,
  visionEnabled,
}: {
  initial: RoomSnapshot
  selfId: string
  visionEnabled: boolean
}) {
  const router = useRouter()
  const { toast } = useToast()
  const { d } = useDict()
  const [seatUserId, setSeatUserId] = useState<string | null>(null)
  const [muted, setMutedState] = useState(() => isMuted())
  const [roundLogOpen, setRoundLogOpen] = useState(false)
  const [memberListOpen, setMemberListOpen] = useState(false)
  const [advisorOpen, setAdvisorOpen] = useState(false)
  const isDesktop = useIsDesktop()

  // 실시간 동기화(useRoomSync)·뮤테이션 후 브로드캐스트(afterMutation)·서버 액션 실행 레이스
  // (runAction)는 전부 이 훅 하나에 배선돼 있다 — 아래는 그 결과로 화면을 어떻게 배치할지만
  // 다룬다. 자세한 배선은 use-room-actions.ts 참고.
  const {
    snapshot,
    online,
    syncFailed,
    showDisconnected,
    staleReason,
    refetch,
    reconnect,
    runAction,
    self,
  } = useRoomActions({ initial, selfId, router, toast, d })

  const isHost = self?.role === 'host'
  const isDealer = isHost || self?.role === 'dealer'
  const pendingActions = useMemo(
    () => snapshot.actions.filter((action) => action.status === 'pending'),
    [snapshot.actions],
  )
  const latestAuditableRound = useMemo(
    () => snapshot.recentRounds.find((round) => round.hasFairnessAudit) ?? null,
    [snapshot.recentRounds],
  )

  // 세로 모바일 화면의 정보 축. 좌석 링을 걷어낸 자리를 이 세 값이 대신한다 —
  // 노선도(누가 무엇을 했고 다음은 누구인가) · 팟 연출 · 내 숫자.
  const participantIds = useMemo(
    () => snapshot.members.filter((member) => member.role !== 'observer').map((m) => m.userId),
    [snapshot.members],
  )
  const rail = useMemo(
    () =>
      turnRail(participantIds, snapshot.actions, { roundActive: Boolean(snapshot.currentRound) }),
    [participantIds, snapshot.actions, snapshot.currentRound],
  )
  const myBet = useMemo(
    () =>
      snapshot.actions.reduce(
        (sum, action) =>
          action.userId === selfId && action.status === 'accepted' ? sum + action.amount : sum,
        0,
      ),
    [snapshot.actions, selfId],
  )
  const pulse = useBetPulse({
    actions: snapshot.actions,
    selfId,
    roundId: snapshot.currentRound?.id ?? null,
    currentActorId: rail.currentId,
  })

  const toggleMute = useCallback(() => {
    setMutedState((current) => {
      const next = !current
      setMuted(next)
      return next
    })
  }, [])

  const isLobby = snapshot.room.status === 'waiting'

  const isBettingGame = snapshot.room.gameType !== 'gostop'
  const canBet = Boolean(self && self.role !== 'observer') && isBettingGame && !isLobby
  // 판이 없을 때도 띄운다. 고스톱 비딜러는 판과 판 사이에 화면이 비어서
  // 다음 동작 주체를 알 수 없었다 — 섯다·포커의 actionBar.noRound와 같은 역할.
  const showGostopWait = !isBettingGame && !isLobby && !isDealer
  // 베팅 게임 관전자는 ActionBar도 DealerQuickBar도 안 뜬다 — 판이 도는 동안 화면에서
  // 아무것도 알려주지 않던 조합이라 전용 상태 표면을 준다.
  const showObserverStatus = isBettingGame && !isLobby && self?.role === 'observer'

  const seatMember = seatUserId
    ? (snapshot.members.find((member) => member.userId === seatUserId) ?? null)
    : null

  const [sheetMember, setSheetMember] = useState<MemberView | null>(null)
  if (seatMember && seatMember !== sheetMember) setSheetMember(seatMember)

  return (
    <main
      id="main"
      // `fixed-page`는 globals.css의 `body:has(> main.fixed-page)` 규칙을 켜는 표식이다. 이게
      // 없으면 body 높이가 콘텐츠로 정해져 아래 `flex-1`이 아무것도 제한하지 못한다 — 방
      // 화면이 그 상태였고 로비가 Pixel 7에서 88px, 데스크톱에서 193px 넘쳤다.
      //
      // 로비 제약이 `lg:`로만 걸려 있던 것도 같이 고쳤다. 모바일 로비는 아예 제약이 없어
      // 초대 QR + 참가자 목록이 길어지는 만큼 문서가 늘어났다. 지금은 두 폭 모두 고정이고
      // 넘치는 내용은 LobbyPanel 안의 스크롤 영역이 흡수한다.
      className="fixed-page mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col overflow-hidden px-4 pb-[calc(var(--action-bar-h,0px)+1.5rem)] pt-5 lg:px-8 lg:pb-6 lg:pt-6"
    >
      <div className="shrink-0">
        <RoomHeader
          snapshot={snapshot}
          isHost={isHost}
          muted={muted}
          onToggleMute={toggleMute}
          onOpenAdvisor={() => setAdvisorOpen(true)}
        />
        <RoomConnectionBar
          syncFailed={syncFailed}
          disconnected={showDisconnected}
          onReconnect={() => {
            reconnect()
            void refetch()
          }}
        />
      </div>

      {isLobby ? (
        <div className="rise-in rise-in-1 mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col overflow-hidden">
          <LobbyPanel
            snapshot={snapshot}
            online={online}
            selfId={selfId}
            runAction={runAction}
            staleReason={staleReason}
            onMemberTap={setSeatUserId}
          />
        </div>
      ) : (
        <>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:grid lg:grid-cols-12 lg:gap-6 lg:overflow-visible">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:col-span-7 lg:overflow-visible xl:col-span-8">
              <div className="rise-in rise-in-1 shrink-0">
                <FairnessPanel
                  snapshot={snapshot}
                  selfId={selfId}
                  runAction={runAction}
                  staleReason={staleReason}
                />
              </div>
              {snapshot.lastResult && !snapshot.currentRound ? (
                <p className="rise-in rise-in-1 mb-2 shrink-0 text-center text-xs text-muted lg:text-sm">
                  {format(d.room.lastRoundSummary, {
                    seq: snapshot.lastResult.seq,
                    name:
                      snapshot.members.find((m) => m.userId === snapshot.lastResult?.winnerId)
                        ?.displayName ?? '?',
                    pot: snapshot.lastResult.pot.toLocaleString(),
                  })}
                  {snapshot.lastResult.note ? ` · ${snapshot.lastResult.note}` : ''}
                  {snapshot.lastResult.hasFairnessAudit ? (
                    <Link
                      href={
                        `/rooms/${snapshot.room.code}/fairness/${snapshot.lastResult.seq}` as Route
                      }
                      className="ml-2 font-bold text-accent underline underline-offset-2"
                    >
                      {d.fairness.auditLink}
                    </Link>
                  ) : null}
                </p>
              ) : null}
              {!snapshot.currentRound &&
              latestAuditableRound &&
              latestAuditableRound.roundId !== snapshot.lastResult?.roundId ? (
                <p className="mb-2 shrink-0 text-center text-xs text-muted lg:text-sm">
                  <Link
                    href={
                      `/rooms/${snapshot.room.code}/fairness/${latestAuditableRound.seq}` as Route
                    }
                    className="font-bold text-accent underline underline-offset-2"
                  >
                    {d.fairness.auditLink}
                  </Link>
                </p>
              ) : null}

              {/*
                세로 모바일과 데스크톱이 서로 다른 것을 그린다.

                폰에서는 좌석 링(GameTable)을 걷어냈다 — 참가자 전원을 팟 둘레에 깔면
                한 명당 폭이 60px 남짓이라 이름도 액션도 못 읽고, 정작 판돈은 가운데에서
                작아진다. 대신 팟만 원형으로 온전히 두고, 판단에 필요한 순서 정보는
                위쪽 노선도 한 줄이, 내 숫자는 아래 SelfBar가 맡는다. 나머지 참가자
                기록은 노선도의 기록 버튼 → BetHistorySheet 로 뺐다.

                데스크톱은 폭이 남으므로 기존 펠트 테이블을 그대로 쓴다. 가로로 돌린
                폰의 pt 예외는 globals.css의 landscape-short 블록과 같은 조건이다.
              */}
              {isDesktop ? (
                <div className="rise-in rise-in-2 relative flex min-h-0 flex-1 items-center justify-center pt-6 [@media(orientation:landscape)_and_(max-height:500px)]:pt-1 lg:pt-3">
                  <GameTable
                    members={snapshot.members}
                    online={online}
                    selfId={selfId}
                    pot={snapshot.currentRound?.pot ?? 0}
                    actions={snapshot.actions}
                    winnerId={
                      snapshot.currentRound ? null : (snapshot.lastResult?.winnerId ?? null)
                    }
                    roundActive={Boolean(snapshot.currentRound)}
                    gameType={snapshot.room.gameType}
                    onSeatTap={(member) => setSeatUserId(member.userId)}
                    fit
                  />
                </div>
              ) : (
                <>
                  <TurnRailBar
                    rail={rail}
                    members={snapshot.members}
                    selfId={selfId}
                    gameType={snapshot.room.gameType}
                    historyCount={snapshot.actions.length}
                    onOpenHistory={() => setRoundLogOpen(true)}
                    className="rise-in rise-in-2 shrink-0"
                  />
                  <div className="rise-in rise-in-2 flex min-h-0 flex-1 items-center justify-center py-3 [@media(orientation:landscape)_and_(max-height:500px)]:py-1">
                    <PotCore
                      pot={snapshot.currentRound?.pot ?? 0}
                      pulse={pulse}
                      roundActive={Boolean(snapshot.currentRound)}
                      className="h-full"
                    />
                  </div>
                  {self ? (
                    <div className="rise-in rise-in-3 flex shrink-0 items-center gap-2">
                      <SelfBar
                        self={self}
                        myBet={myBet}
                        online={online.has(selfId)}
                        className="min-w-0 flex-1"
                      />
                      {/* 좌석 링이 없어진 뒤 MemberSheet(바이인·대리 베팅·역할)로 가는
                          유일한 입구다 — 없으면 판 도중 딜러가 대리 입력을 못 한다. */}
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="shrink-0"
                        aria-label={d.room.membersAria}
                        title={d.room.membersTitle}
                        onClick={() => setMemberListOpen(true)}
                      >
                        👥
                      </Button>
                    </div>
                  ) : null}
                </>
              )}
              {isDesktop && canBet && self ? (
                <div className="rise-in rise-in-3 lg:mt-3 lg:shrink-0">
                  <ActionBar
                    snapshot={snapshot}
                    self={self}
                    runAction={runAction}
                    staleReason={staleReason}
                    inline
                  />
                </div>
              ) : null}
              {showGostopWait ? (
                <div className="rise-in rise-in-3 shrink-0 lg:mt-3">
                  <GostopWaitPanel hasRound={Boolean(snapshot.currentRound)} />
                </div>
              ) : null}
              {showObserverStatus ? (
                <div className="rise-in rise-in-3 shrink-0 lg:mt-3">
                  <ObserverStatusPanel snapshot={snapshot} />
                </div>
              ) : null}
            </div>
            {isDesktop ? (
              <div className="lg:col-span-5 lg:flex lg:min-h-0 lg:flex-col xl:col-span-4">
                <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:pe-1">
                  {isDealer ? (
                    <div className="rise-in rise-in-2">
                      <DealerPanel
                        snapshot={snapshot}
                        pendingActions={pendingActions}
                        selfId={selfId}
                        runAction={runAction}
                        staleReason={staleReason}
                      />
                    </div>
                  ) : null}

                  <div className="rise-in rise-in-3">
                    {/* gameType 을 안 넘기면 기본값 'seotda' 라벨이 박혀 포커 방에서 '폴드'가
                        '다이'로 보였다 — 모바일 시트도 같은 값을 받는다. */}
                    <RoundLog
                      actions={snapshot.actions}
                      members={snapshot.members}
                      gameType={snapshot.room.gameType}
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </div>
          {!isDesktop && self && (canBet || isDealer) ? (
            <ActionBar
              snapshot={snapshot}
              self={self}
              runAction={runAction}
              staleReason={staleReason}
              showBetting={canBet}
              dealerSlot={
                isDealer ? (
                  <DealerQuickBar
                    snapshot={snapshot}
                    pendingActions={pendingActions}
                    selfId={selfId}
                    runAction={runAction}
                    staleReason={staleReason}
                  />
                ) : null
              }
            />
          ) : null}
        </>
      )}
      {sheetMember ? (
        <MemberSheet
          open={seatUserId !== null}
          member={sheetMember}
          snapshot={snapshot}
          selfId={selfId}
          runAction={runAction}
          onClose={() => setSeatUserId(null)}
        />
      ) : null}
      <MemberListSheet
        open={memberListOpen}
        onClose={() => setMemberListOpen(false)}
        members={snapshot.members}
        online={online}
        selfId={selfId}
        actions={snapshot.actions}
        gameType={snapshot.room.gameType}
        onSelect={(userId) => {
          // 목록을 닫고 상세 시트를 연다 — 시트 두 장이 겹치면 포커스 트랩이 서로를 물어
          // 뒤쪽 시트에서 ESC·바깥 클릭이 먹지 않는다.
          setMemberListOpen(false)
          setSeatUserId(userId)
        }}
      />
      <BetHistorySheet
        open={roundLogOpen}
        onClose={() => setRoundLogOpen(false)}
        actions={snapshot.actions}
        members={snapshot.members}
        gameType={snapshot.room.gameType}
        selfId={selfId}
        roundSeq={snapshot.currentRound?.seq}
        fullHistoryHref={`/rooms/${snapshot.room.code}/history`}
      />
      {/* 판독기는 시트 높이를 직접 정해야 한다. `PaneGroup`이 `min-h-0 flex-1`이라
          높이가 열려 있으면 픽커가 접히지 않고 시트를 세로로 밀어낸다. */}
      <Sheet
        open={advisorOpen}
        onClose={() => setAdvisorOpen(false)}
        ariaLabel={d.room.advisorAria}
        className="flex h-[88dvh] flex-col overflow-hidden sm:h-[82dvh] sm:max-w-4xl"
      >
        <AdvisorBoard visionEnabled={visionEnabled} initialTab={snapshot.room.gameType} />
      </Sheet>
    </main>
  )
}
