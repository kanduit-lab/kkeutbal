'use client'

import { useTransition } from 'react'
import { startRound } from '../round-actions'
import type { RoomSnapshot } from '../types'
import { Avatar, Badge, Button, Panel, useToast } from '@/components/ui'
import type { RunAction } from './shared'

const ROLE_LABELS: Record<string, string | null> = {
  host: '방장',
  dealer: '딜러',
  player: null,
  observer: '관전',
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
}: {
  snapshot: RoomSnapshot
  online: ReadonlySet<string>
  selfId: string
  runAction: RunAction
}) {
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()

  const self = snapshot.members.find((member) => member.userId === selfId)
  const isDealer = self?.role === 'host' || self?.role === 'dealer'

  async function copy(text: string, message: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast(message, 'success')
    } catch {
      toast('복사할 수 없습니다. 직접 코드를 알려주세요', 'error')
    }
  }

  return (
    <div className="space-y-4">
      <Panel className="space-y-3 text-center">
        <p className="text-sm font-medium text-muted">입장 코드</p>
        <p className="font-mono text-5xl font-black tracking-[0.3em] sm:text-6xl">
          {snapshot.room.code}
        </p>
        <p className="text-xs text-muted">같은 코드로 들어오면 자동으로 자리가 생깁니다</p>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="surface"
            className="border border-white/10"
            onClick={() => copy(snapshot.room.code, '코드를 복사했습니다')}
          >
            코드 복사
          </Button>
          <Button
            variant="surface"
            className="border border-white/10"
            onClick={() =>
              copy(`${window.location.origin}/rooms/${snapshot.room.code}`, '링크를 복사했습니다')
            }
          >
            링크 복사
          </Button>
        </div>
      </Panel>

      <Panel className="space-y-3">
        <h2 className="flex items-center justify-between text-sm font-bold text-muted">
          참가자 {snapshot.members.length}명
        </h2>
        <ul className="space-y-2">
          {snapshot.members.map((member) => {
            const roleLabel = ROLE_LABELS[member.role]
            const isOnline = online.has(member.userId)
            return (
              <li key={member.userId} className="flex items-center gap-3">
                <div className="relative">
                  <Avatar name={member.displayName} url={member.avatarUrl} size={44} />
                  <span
                    className={
                      isOnline
                        ? 'absolute -right-0.5 bottom-0 size-3 rounded-full border-2 border-black bg-win shadow-[0_0_6px_var(--color-win)]'
                        : 'absolute -right-0.5 bottom-0 size-3 rounded-full border-2 border-black bg-white/25'
                    }
                    title={isOnline ? '접속' : '오프라인'}
                  />
                </div>
                <span className="min-w-0 flex-1 truncate text-base font-bold">
                  {member.displayName}
                  {member.userId === selfId ? <span className="ml-1.5 text-xs text-muted">나</span> : null}
                </span>
                {roleLabel ? <Badge tone="accent">{roleLabel}</Badge> : null}
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
          ▶ 판 시작
        </Button>
      ) : (
        <p className="text-center text-sm text-muted">방장이 판을 시작하면 게임 화면으로 바뀝니다</p>
      )}
    </div>
  )
}
