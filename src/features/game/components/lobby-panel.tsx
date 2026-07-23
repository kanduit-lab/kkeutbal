'use client'

import { useEffect, useState, useTransition } from 'react'
import { startRound } from '../round-actions'
import type { RoomSnapshot } from '../types'
import { Avatar, Badge, Button, Panel, useToast } from '@/components/ui'
import { QrCode } from '@/components/qr-code'
import { format, useDict } from '@/lib/i18n/client'
import type { RunAction } from './shared'

/**
 * 입장 대기방 — 첫 판이 시작되기 전(status waiting)의 로비.
 * 코드 공유·참가자 확인·판 시작이 한 화면에서 끝난다.
 */
export function LobbyPanel({
  snapshot,
  online,
  selfId,
  runAction,
  onMemberTap,
}: {
  snapshot: RoomSnapshot
  online: ReadonlySet<string>
  selfId: string
  runAction: RunAction
  /** 지정하면 참가자 행이 버튼이 되어 멤버 시트를 연다 (RoomClient 가 좌석 선택을 넘긴다). */
  onMemberTap?: (userId: string) => void
}) {
  const { toast } = useToast()
  const { d } = useDict()
  const [isPending, startTransition] = useTransition()
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
        {origin ? (
          <div className="flex justify-center">
            <QrCode value={`${origin}/rooms/${snapshot.room.code}`} />
          </div>
        ) : null}
        <p className="text-xs text-muted">{d.lobby.joinHint}</p>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="surface"
            className="border border-white/10"
            onClick={() => copy(snapshot.room.code, d.lobby.codeCopied)}
          >
            {d.lobby.copyCode}
          </Button>
          <Button
            variant="surface"
            className="border border-white/10"
            onClick={() =>
              copy(`${window.location.origin}/rooms/${snapshot.room.code}`, d.lobby.linkCopied)
            }
          >
            {d.lobby.copyLink}
          </Button>
        </div>
      </Panel>

      <Panel className="space-y-3">
        <h2 className="flex items-center justify-between text-sm font-bold text-muted">
          {format(d.lobby.membersCount, { n: snapshot.members.length })}
        </h2>
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
                  <span
                    className={
                      isOnline
                        ? 'absolute -right-0.5 bottom-0 size-3 rounded-full border-2 border-black bg-win shadow-[0_0_6px_var(--color-win)]'
                        : 'absolute -right-0.5 bottom-0 size-3 rounded-full border-2 border-black bg-white/25'
                    }
                    title={isOnline ? d.common.online : d.common.offline}
                    aria-hidden
                  />
                  <span className="sr-only">{isOnline ? d.common.online : d.common.offline}</span>
                </div>
                <span className="min-w-0 flex-1 truncate text-base font-bold">
                  {member.displayName}
                  {member.userId === selfId ? (
                    <span className="ml-1.5 text-xs text-muted">{d.common.me}</span>
                  ) : null}
                </span>
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
          disabled={isPending}
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
