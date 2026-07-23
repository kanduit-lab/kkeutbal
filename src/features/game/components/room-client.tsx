'use client'

import Link from 'next/link'
import { useCallback, useMemo, useState } from 'react'
import { sendRoomEvent } from '@/lib/realtime/client'
import type { EventName } from '@/lib/realtime/events'
import { playChip, playRoundStart, playWin } from '@/lib/sound'
import type { RoomSnapshot } from '../types'
import { Badge, useToast } from '@/components/ui'
import { useRoomSync } from './use-room-sync'
import { GameTable } from './game-table'
import { ActionBar } from './action-bar'
import { DealerPanel } from './dealer-panel'
import { LobbyPanel } from './lobby-panel'
import { MemberSheet } from './member-sheet'
import { RoundLog } from './round-log'
import { GAME_LABELS, type BroadcastSpec, type RunAction } from './shared'

/**
 * 방 실시간 오케스트레이터. 동기화는 useRoomSync 가 소유한다.
 * 행동한 클라이언트가 Server Action 성공 후 직접 브로드캐스트한다.
 */
export function RoomClient({
  initial,
  selfId,
}: {
  initial: RoomSnapshot
  selfId: string
}) {
  const { toast } = useToast()
  const [seatUserId, setSeatUserId] = useState<string | null>(null)

  const onEvent = useCallback(
    (name: EventName, payload: unknown, current: RoomSnapshot) => {
      if (name === 'bet.rejected') {
        const rejected = payload as { actionId: string; reason: string }
        const mine = current.actions.find(
          (action) => action.id === rejected.actionId && action.userId === selfId,
        )
        if (mine) toast(`베팅 거절됨: ${rejected.reason}`, 'error')
      }
      if (name === 'bet.placed') {
        const placed = payload as { amount: number }
        if (placed.amount > 0) playChip()
      }
      if (name === 'round.started') {
        const started = payload as { seq: number }
        toast(`${started.seq}번째 판 시작`, 'info')
        playRoundStart()
      }
      if (name === 'round.ended') {
        const ended = payload as { winnerId: string | null; pot: number }
        const winner = current.members.find((member) => member.userId === ended.winnerId)
        if (winner) {
          toast(`🏆 ${winner.displayName} 승리 +${ended.pot.toLocaleString()}`, 'success')
          playWin()
        }
      }
    },
    [selfId, toast],
  )

  const { snapshot, online, connected, everConnected, refetch, reconnect, channelRef } =
    useRoomSync({ initial, selfId, onEvent })
  const showDisconnected = everConnected && !connected
  const roomId = initial.room.id

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
      // 서버가 응답하지 않아도 버튼이 영원히 잠기지 않게 15초 타임아웃을 둔다.
      const result = await Promise.race([
        run(),
        new Promise<{ success: false; error: string }>((resolve) =>
          setTimeout(
            () => resolve({ success: false, error: '서버 응답이 없습니다. 다시 시도하세요' }),
            15_000,
          ),
        ),
      ])
      if (!result.success) {
        toast(result.error, 'error')
        return false
      }
      const broadcast = onSuccess?.(result.data)
      await afterMutation(broadcast ?? undefined)
      return true
    },
    [afterMutation, toast],
  )

  const self = useMemo(
    () => snapshot.members.find((member) => member.userId === selfId) ?? null,
    [snapshot.members, selfId],
  )
  const isHost = self?.role === 'host'
  const isDealer = isHost || self?.role === 'dealer'
  const pendingActions = useMemo(
    () => snapshot.actions.filter((action) => action.status === 'pending'),
    [snapshot.actions],
  )

  /** 첫 판 전 로비 — 코드 공유와 참가자 확인에 집중한다. */
  const isLobby = snapshot.room.status === 'waiting'
  // 고스톱은 베팅 없이 판 종료 시 점수로 정산한다 — 베팅 바를 렌더하지 않는다.
  const isBettingGame = snapshot.room.gameType !== 'gostop'
  const canBet = Boolean(self && self.role !== 'observer') && isBettingGame && !isLobby

  const sheetMember = seatUserId
    ? (snapshot.members.find((member) => member.userId === seatUserId) ?? null)
    : null

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-56 pt-5 lg:px-8 lg:pb-12 lg:pt-8">
      <header className="rise-in mb-5 flex items-center justify-between lg:mb-8">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" className="text-xl text-muted transition-colors hover:text-text">
            ←
          </Link>
          <div className="min-w-0">
            <h1 className="truncate font-brush text-xl font-bold leading-tight lg:text-3xl">
              {snapshot.room.name}
            </h1>
            <p className="mt-0.5 text-xs text-muted lg:text-sm">
              코드 <span className="font-mono font-bold tracking-widest">{snapshot.room.code}</span>
              {' · '}
              {GAME_LABELS[snapshot.room.gameType].name}
              {' · '}
              {snapshot.room.inputMode === 'trust' ? '바로 반영' : '딜러 승인'}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {showDisconnected ? (
            <button
              type="button"
              onClick={reconnect}
              className="rounded-md bg-warn/20 px-2 py-1 text-xs font-bold text-warn"
            >
              연결 끊김 · 다시 연결
            </button>
          ) : null}
          <Link
            href={`/rooms/${snapshot.room.code}/monitor`}
            className="rounded-lg border border-white/10 px-2 py-1.5 text-sm text-muted transition-colors hover:text-text"
            title="모니터링 화면 (전광판)"
          >
            📺
          </Link>
          {isHost ? (
            <Link
              href={`/rooms/${snapshot.room.code}/settings`}
              className="rounded-lg border border-white/10 px-2 py-1.5 text-sm text-muted transition-colors hover:text-text"
              title="방 옵션"
            >
              ⚙️
            </Link>
          ) : null}
          <Badge tone={snapshot.currentRound ? 'win' : 'muted'}>
            {snapshot.currentRound ? `${snapshot.currentRound.seq}판 진행 중` : '대기'}
          </Badge>
        </div>
      </header>

      {isLobby ? (
        <div className="rise-in rise-in-1 mx-auto max-w-xl">
          <LobbyPanel snapshot={snapshot} online={online} selfId={selfId} runAction={runAction} />
        </div>
      ) : (
        <div className="lg:grid lg:grid-cols-12 lg:gap-6">
          <div className="lg:col-span-7 xl:col-span-8">
            {snapshot.lastResult && !snapshot.currentRound ? (
              <p className="rise-in rise-in-1 mb-2 text-center text-xs text-muted lg:text-sm">
                지난 {snapshot.lastResult.seq}판:{' '}
                {snapshot.members.find((m) => m.userId === snapshot.lastResult?.winnerId)
                  ?.displayName ?? '무효'}{' '}
                +{snapshot.lastResult.pot.toLocaleString()}
                {snapshot.lastResult.note ? ` · ${snapshot.lastResult.note}` : ''}
              </p>
            ) : null}

            <div className="rise-in rise-in-2 pt-6">
              <GameTable
                members={snapshot.members}
                online={online}
                selfId={selfId}
                pot={snapshot.currentRound?.pot ?? 0}
                actions={snapshot.actions}
                winnerId={snapshot.currentRound ? null : (snapshot.lastResult?.winnerId ?? null)}
                onSeatTap={(member) => setSeatUserId(member.userId)}
              />
            </div>

            {canBet && self ? (
              <div className="rise-in rise-in-3 hidden lg:block">
                <ActionBar snapshot={snapshot} self={self} runAction={runAction} inline />
              </div>
            ) : null}
          </div>

          <div className="lg:col-span-5 xl:col-span-4">
            {isDealer ? (
              <div className="rise-in rise-in-2">
                <DealerPanel
                  snapshot={snapshot}
                  pendingActions={pendingActions}
                  selfId={selfId}
                  runAction={runAction}
                />
              </div>
            ) : null}

            <div className="rise-in rise-in-3">
              <RoundLog actions={snapshot.actions} members={snapshot.members} />
            </div>
          </div>
        </div>
      )}

      {canBet && self ? (
        <div className="lg:hidden">
          <ActionBar snapshot={snapshot} self={self} runAction={runAction} />
        </div>
      ) : null}

      {sheetMember ? (
        <MemberSheet
          member={sheetMember}
          snapshot={snapshot}
          selfId={selfId}
          runAction={runAction}
          onClose={() => setSeatUserId(null)}
        />
      ) : null}
    </main>
  )
}
