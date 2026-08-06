'use client'

import { useEffect, useState, useTransition } from 'react'
import { startRound } from '../round-actions'
import type { RoomSnapshot } from '../types'
import { Avatar, Badge, Button, Panel, Segmented, useToast } from '@/components/ui'
import { QrCode } from '@/components/qr-code'
import { format, useDict } from '@/lib/i18n/client'
import { AddLocalMemberForm } from './lobby-add-local-member'
import type { RunAction } from './shared'

function inviteUrl(origin: string, code: string, target: 'member' | 'guest'): string {
  const roomPath = `/rooms/${code}`
  if (target === 'member') return `${origin}${roomPath}`
  return `${origin}/login?mode=guest&next=${encodeURIComponent(roomPath)}`
}

export function LobbyPanel({
  snapshot,
  online,
  selfId,
  runAction,
  staleReason = null,
  onMemberTap,
}: {
  snapshot: RoomSnapshot
  online: ReadonlySet<string>
  selfId: string
  runAction: RunAction

  staleReason?: string | null

  onMemberTap?: (userId: string) => void
}) {
  const { toast } = useToast()
  const { d } = useDict()
  const [isPending, startTransition] = useTransition()
  const [inviteTarget, setInviteTarget] = useState<'member' | 'guest'>('member')

  const [origin, setOrigin] = useState<string | null>(null)
  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const self = snapshot.members.find((member) => member.userId === selfId)
  const isHost = self?.role === 'host'
  const isDealer = isHost || self?.role === 'dealer'

  // 판을 시작하는 쪽이 보는 숫자는 "방에 몇 명인가"가 아니라 "몇 명이 실제로 치는가"다.
  // `startRound`(round-actions.ts)가 관전자를 뺀 2명 이상을 요구하는데, 예전에는 그 사실이
  // 버튼을 눌러 실패 토스트를 볼 때까지 화면 어디에도 없었다 — 시작 전에 관전자를 지정하고
  // 나면 남은 인원이 몇인지가 곧바로 안 보였다.
  const playerCount = snapshot.members.filter((member) => member.role !== 'observer').length
  const observerCount = snapshot.members.length - playerCount
  const notEnoughPlayers = playerCount < 2
  const startBlockedReason = staleReason ?? (notEnoughPlayers ? d.lobby.needTwoPlayers : null)

  // 이름을 누르면 열리는 시트(`MemberSheet`)가 시작 전 관전자 지정의 유일한 입구인데 행에
  // 아무 표시가 없어서 아무도 찾지 못했다. 할 수 있는 것이 사람마다 달라 문구도 갈린다 —
  // 딜러는 역할을 바꿀 수 없으므로(방장 전용) 잘못된 약속 대신 아무것도 쓰지 않는다.
  const memberTapHint = isHost
    ? d.lobby.manageMemberHint
    : self && (self.role === 'player' || self.role === 'observer')
      ? d.lobby.selfRoleHint
      : null

  async function copy(text: string, message: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast(message, 'success')
    } catch {
      toast(d.lobby.copyFailed, 'error')
    }
  }

  // 고정 뷰포트 규약(docs/12-handoff.md 11번): 초대 코드·QR·참가자 목록은 사람이 늘수록
  // 길어지니 내부 스크롤로 흡수하고, 판 시작 버튼은 아래에 고정한다. 목록과 같이 스크롤되면
  // 사람이 많은 방에서 딜러가 판을 시작하려고 스크롤을 내려야 했다.
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain">
        <Panel className="space-y-3 text-center">
          <p className="text-sm font-medium text-muted">{d.lobby.codeTitle}</p>
          <p className="font-mono text-5xl font-black tracking-[0.3em] sm:text-6xl">
            {snapshot.room.code}
          </p>
          <Segmented
            value={inviteTarget}
            onChange={setInviteTarget}
            ariaLabel={d.lobby.inviteTargetAria}
            size="sm"
            className="grid-cols-2"
            options={[
              { value: 'member', label: d.lobby.inviteMember },
              { value: 'guest', label: d.lobby.inviteGuest },
            ]}
          />
          {origin ? (
            <div className="flex justify-center">
              <QrCode
                value={inviteUrl(origin, snapshot.room.code, inviteTarget)}
                alt={d.lobby.qrAlt}
              />
            </div>
          ) : null}
          <p className="text-xs text-muted">
            {inviteTarget === 'guest' ? d.lobby.guestJoinHint : d.lobby.joinHint}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => copy(snapshot.room.code, d.lobby.codeCopied)}>
              {d.lobby.copyCode}
            </Button>
            <Button
              variant="outline"
              disabled={origin === null}
              onClick={() => {
                if (!origin) return
                void copy(inviteUrl(origin, snapshot.room.code, inviteTarget), d.lobby.linkCopied)
              }}
            >
              {d.lobby.copyLink}
            </Button>
          </div>
        </Panel>
        <Panel className="space-y-3">
          <h2 className="flex items-center justify-between text-sm font-bold text-muted">
            {observerCount > 0
              ? format(d.lobby.membersSplit, { players: playerCount, observers: observerCount })
              : format(d.lobby.membersCount, { n: snapshot.members.length })}
          </h2>
          {onMemberTap && memberTapHint ? (
            <p className="text-xs text-muted">{memberTapHint}</p>
          ) : null}
          {isDealer ? <AddLocalMemberForm roomId={snapshot.room.id} runAction={runAction} /> : null}
          <ul className="space-y-1">
            {snapshot.members.map((member) => {
              const roleLabel =
                member.role === 'host'
                  ? d.roles.host
                  : member.role === 'dealer'
                    ? d.roles.dealer
                    : member.role === 'observer'
                      ? d.roles.observerShort
                      : null
              const isOnline = online.has(member.userId)
              const row = (
                <>
                  <div className="relative">
                    <Avatar name={member.displayName} url={member.avatarUrl} size={44} />
                    {member.isManaged ? null : (
                      <>
                        <span
                          className={
                            isOnline
                              ? 'absolute -right-0.5 bottom-0 size-3 rounded-full border-2 border-black bg-win shadow-[0_0_6px_var(--color-win)]'
                              : 'absolute -right-0.5 bottom-0 size-3 rounded-full border-2 border-black bg-white/25'
                          }
                          title={isOnline ? d.common.online : d.common.offline}
                          aria-hidden
                        />
                        <span className="sr-only">
                          {isOnline ? d.common.online : d.common.offline}
                        </span>
                      </>
                    )}
                  </div>
                  <span className="min-w-0 flex-1 truncate text-base font-bold">
                    {member.displayName}
                    {member.userId === selfId ? (
                      <span className="ml-1.5 text-xs text-muted">{d.common.me}</span>
                    ) : null}
                  </span>
                  {member.isManaged ? <Badge tone="muted">{d.lobby.localBadge}</Badge> : null}
                  {roleLabel ? <Badge tone="accent">{roleLabel}</Badge> : null}
                </>
              )
              return (
                <li key={member.userId}>
                  {onMemberTap ? (
                    <button
                      type="button"
                      className="flex min-h-12 w-full items-center gap-3 rounded-xl px-1.5 text-left transition-colors hover:bg-white/5 active:bg-white/10"
                      onClick={() => onMemberTap(member.userId)}
                    >
                      {row}
                    </button>
                  ) : (
                    <div className="flex min-h-12 items-center gap-3 px-1.5">{row}</div>
                  )}
                </li>
              )
            })}
          </ul>
        </Panel>
      </div>
      {isDealer ? (
        <Button
          variant="primary"
          size="lg"
          className="w-full shrink-0 text-lg"
          loading={isPending}
          loadingLabel={d.ui.processing}
          disabled={startBlockedReason !== null}
          disabledReason={startBlockedReason ?? undefined}
          onClick={() => {
            if (isPending) return
            startTransition(async () => {
              await runAction(
                () => startRound(snapshot.room.id),
                (data) => ({
                  event: 'round.started',
                  payload: { roundId: data.roundId, seq: data.seq },
                }),
              )
            })
          }}
        >
          ▶ {d.lobby.startRound}
        </Button>
      ) : (
        <p className="shrink-0 text-center text-sm text-muted">{d.lobby.waitingForDealer}</p>
      )}
    </div>
  )
}
