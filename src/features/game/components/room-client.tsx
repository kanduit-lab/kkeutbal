'use client'

import { clsx } from 'clsx'
import Link from 'next/link'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { format, translateError, useDict } from '@/lib/i18n/client'
import { sendRoomEvent } from '@/lib/realtime/client'
import { isMuted, setMuted } from '@/lib/sound'
import type { MemberView, RoomSnapshot } from '../types'
import { Button, Sheet, useIsDesktop, useToast } from '@/components/ui'
import { AUTH_ERROR_KEYS, useRoomSync } from './use-room-sync'
import { useRoomEventFeedback } from './use-room-event-feedback'
import { RoomHeader } from './room-header'
import { RoomConnectionBar } from './room-connection-bar'
import { GameTable } from './game-table'
import { ActionBar } from './action-bar'
import { DealerPanel } from './dealer-panel'
import { DealerQuickBar } from './dealer-quick-bar'
import { GostopWaitPanel } from './gostop-wait-panel'
import { LobbyPanel } from './lobby-panel'
import { MemberSheet } from './member-sheet'
import { RoundLog } from './round-log'
import { FairnessPanel } from './fairness-panel'
import type { BroadcastSpec, RunAction } from './shared'

export function RoomClient({ initial, selfId }: { initial: RoomSnapshot; selfId: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const { d } = useDict()
  const [seatUserId, setSeatUserId] = useState<string | null>(null)
  const [muted, setMutedState] = useState(() => isMuted())
  const [roundLogOpen, setRoundLogOpen] = useState(false)
  const isDesktop = useIsDesktop()

  const onEvent = useRoomEventFeedback(selfId)

  const {
    snapshot,
    online,
    connected,
    everConnected,
    connectTimedOut,
    syncFailed,
    authError,
    refetch,
    reconnect,
    channelRef,
  } = useRoomSync({ initial, selfId, onEvent })

  const showDisconnected = (everConnected && !connected) || connectTimedOut
  const roomId = initial.room.id
  const roomCode = initial.room.code

  const staleReason = syncFailed ? d.room.staleGate : null

  useEffect(() => {
    if (!authError) return
    if (authError === AUTH_ERROR_KEYS.loginRequired) {
      toast(d.room.sessionExpired, 'error')

      router.push(`/login?next=${encodeURIComponent(`/rooms/${roomCode}`)}` as Route)
      return
    }
    toast(translateError(d, authError), 'error')
    router.push('/')
  }, [authError, router, toast, d, roomCode])

  const afterMutation = useCallback(
    async (broadcast?: BroadcastSpec) => {
      const result = await refetch()
      const channel = channelRef.current
      if (!channel) return
      if (broadcast) {
        sendRoomEvent(channel, roomId, selfId, broadcast.event, broadcast.payload)
      }
      if (result.success) {
        sendRoomEvent(channel, roomId, selfId, 'state.snapshot', {
          roomStatus: result.data.room.status,
          currentRound: result.data.currentRound
            ? {
                roundId: result.data.currentRound.id,
                seq: result.data.currentRound.seq,
                pot: result.data.currentRound.pot,
              }
            : null,
          balances: result.data.members.map((member) => ({
            userId: member.userId,
            balance: Math.max(0, member.balance),
          })),
        })
      }
    },
    [refetch, channelRef, roomId, selfId],
  )

  const runAction: RunAction = useCallback(
    async (run, onSuccess) => {
      let actionSucceeded = false
      try {
        let timedOut = false
        const pending = run()
        const result = await Promise.race([
          pending,
          new Promise<{ success: false; error: string }>((resolve) =>
            setTimeout(() => {
              timedOut = true
              resolve({
                success: false,
                error: d.room.serverSlow,
              })
            }, 15_000),
          ),
        ])
        if (!result.success) {
          toast(translateError(d, result.error), 'error')
          if (timedOut) {
            void refetch()
            pending.then(
              (late) => {
                if (late.success) void refetch()
              },
              () => undefined,
            )
          }
          return false
        }
        actionSucceeded = true
        const broadcast = onSuccess?.(result.data)
        await afterMutation(broadcast ?? undefined)
        return true
      } catch (error) {
        if (actionSucceeded) {
          console.error('post-action sync failed:', error)
          return true
        }

        console.error('runAction failed:', error)
        toast(d.room.networkError, 'error')
        void refetch()
        return false
      }
    },
    [afterMutation, refetch, toast, d],
  )

  const self = useMemo(
    () => snapshot.members.find((member) => member.userId === selfId) ?? null,
    [snapshot.members, selfId],
  )

  const wasMemberRef = useRef(false)
  useEffect(() => {
    if (self) {
      wasMemberRef.current = true
      return
    }
    if (wasMemberRef.current) {
      wasMemberRef.current = false
      toast(d.room.removedFromRoom, 'error')
      router.push('/')
    }
  }, [self, toast, router, d])

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
  const showGostopWait =
    !isBettingGame && !isLobby && Boolean(snapshot.currentRound) && !isDealer

  const seatMember = seatUserId
    ? (snapshot.members.find((member) => member.userId === seatUserId) ?? null)
    : null

  const [sheetMember, setSheetMember] = useState<MemberView | null>(null)
  if (seatMember && seatMember !== sheetMember) setSheetMember(seatMember)

  return (
    <main
      id="main"
      className={clsx(
        'mx-auto flex w-full max-w-6xl flex-col px-4 pb-[calc(var(--action-bar-h,0px)+1.5rem)] pt-5 lg:px-8 lg:pb-6 lg:pt-6',
        isLobby ? 'lg:min-h-0 lg:flex-1 lg:overflow-hidden' : 'min-h-0 flex-1 overflow-hidden',
      )}
    >
      <div className="shrink-0">
        <RoomHeader snapshot={snapshot} isHost={isHost} muted={muted} onToggleMute={toggleMute} />
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
        <div className="rise-in rise-in-1 mx-auto w-full max-w-xl lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain">
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

              <div className="rise-in rise-in-2 relative flex min-h-0 flex-1 items-center justify-center pt-6 lg:pt-3">
                <GameTable
                  members={snapshot.members}
                  online={online}
                  selfId={selfId}
                  pot={snapshot.currentRound?.pot ?? 0}
                  actions={snapshot.actions}
                  winnerId={snapshot.currentRound ? null : (snapshot.lastResult?.winnerId ?? null)}
                  roundActive={Boolean(snapshot.currentRound)}
                  gameType={snapshot.room.gameType}
                  onSeatTap={(member) => setSeatUserId(member.userId)}
                  fit
                />
                {!isDesktop ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="absolute right-1 top-1 z-20"
                    aria-label={d.roundLog.openAria}
                    onClick={() => setRoundLogOpen(true)}
                  >
                    📋
                  </Button>
                ) : null}
              </div>
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
                  <GostopWaitPanel />
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
                    <RoundLog actions={snapshot.actions} members={snapshot.members} />
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
      <Sheet
        open={roundLogOpen}
        onClose={() => setRoundLogOpen(false)}
        ariaLabel={d.roundLog.title}
      >
        <RoundLog actions={snapshot.actions} members={snapshot.members} scrollable={false} />
      </Sheet>
    </main>
  )
}
