'use client'

import { useEffect, useState, useTransition } from 'react'
import { startRound } from '../round-actions'
import type { RoomSnapshot } from '../types'
import { Avatar, Badge, Button, Panel, Segmented, useToast } from '@/components/ui'
import { QrCode } from '@/components/qr-code'
import { format, useDict } from '@/lib/i18n/client'
import { AddLocalMemberForm } from './lobby-add-local-member'
import type { RunAction } from './shared'

/**
 * 초대 링크 두 갈래.
 *
 * - member: 방 URL. 로그인 상태면 바로 좌석이 생기고, 아니면 proxy 가 로그인으로 보낸다.
 * - guest: 계정이 없는 사람용. `/rooms/*` 는 인증 필수 경로라 방 URL 만 담은 QR 을 찍으면
 *   아이디/비밀번호 폼이 기본으로 열려 게스트는 무엇을 해야 하는지 알 수 없다.
 *   `mode=guest` 로 게스트 폼을 먼저 열고, `next` 로 인증 후 방까지 이어 준다.
 */
function inviteUrl(origin: string, code: string, target: 'member' | 'guest'): string {
  const roomPath = `/rooms/${code}`
  if (target === 'member') return `${origin}${roomPath}`
  return `${origin}/login?mode=guest&next=${encodeURIComponent(roomPath)}`
}

/**
 * 입장 대기방 — 첫 판이 시작되기 전(status waiting)의 로비.
 * 코드 공유·참가자 확인·판 시작이 한 화면에서 끝난다.
 */
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
  /** 스냅샷이 낡아 조작을 잠글 사유. null 이면 정상. */
  staleReason?: string | null
  /** 지정하면 참가자 행이 버튼이 되어 멤버 시트를 연다 (RoomClient 가 좌석 선택을 넘긴다). */
  onMemberTap?: (userId: string) => void
}) {
  const { toast } = useToast()
  const { d } = useDict()
  const [isPending, startTransition] = useTransition()
  const [inviteTarget, setInviteTarget] = useState<'member' | 'guest'>('member')
  // SSR 에는 window 가 없다 — 마운트 후에만 조인 URL 을 만들어 QR 을 그린다.
  const [origin, setOrigin] = useState<string | null>(null)
  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const self = snapshot.members.find((member) => member.userId === selfId)
  const isDealer = self?.role === 'host' || self?.role === 'dealer'

  async function copy(text: string, message: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast(message, 'success')
    } catch {
      toast(d.lobby.copyFailed, 'error')
    }
  }

  return (
    <div className="space-y-4">
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
          <Button
            variant="outline"
            onClick={() => copy(snapshot.room.code, d.lobby.codeCopied)}
          >
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
          {format(d.lobby.membersCount, { n: snapshot.members.length })}
        </h2>
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
                  {/* 로컬 좌석은 접속이라는 개념이 없다 — 영원한 '오프라인' 표시를 달지 않는다. */}
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
                {/* 본인 화면이 없는 좌석임을 밝힌다 — 안 그러면 "왜 계속 오프라인이지"가 된다. */}
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

      {isDealer ? (
        <Button
          variant="primary"
          size="lg"
          className="w-full text-lg"
          loading={isPending}
          loadingLabel={d.ui.processing}
          disabled={staleReason !== null}
          disabledReason={staleReason ?? undefined}
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
        <p className="text-center text-sm text-muted">{d.lobby.waitingForDealer}</p>
      )}
    </div>
  )
}
