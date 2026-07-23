'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { createGuestToken, revokeGuestToken, setAdmin } from '../admin-actions'
import type { AdminUserView, GuestTokenView } from '../admin-queries'
import { Badge, Button, ConfirmDialog, Input, Panel, useToast } from '@/components/ui'

const EXPIRY_PRESETS = [
  { label: '24시간', hours: 24 },
  { label: '3일', hours: 72 },
  { label: '7일', hours: 168 },
  { label: '무기한', hours: 0 },
] as const

export function AdminClient({
  tokens,
  users,
  selfId,
}: {
  tokens: readonly GuestTokenView[]
  users: readonly AdminUserView[]
  selfId: string
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()

  const [label, setLabel] = useState('')
  const [hours, setHours] = useState<number>(72)
  const [revokeTarget, setRevokeTarget] = useState<GuestTokenView | null>(null)
  const [adminTarget, setAdminTarget] = useState<AdminUserView | null>(null)

  function issue() {
    if (isPending || !label.trim()) return
    startTransition(async () => {
      const result = await createGuestToken({ label: label.trim(), expiresInHours: hours })
      if (result.success) {
        toast(`토큰 발급됨: ${result.data.code}`, 'success')
        setLabel('')
        router.refresh()
      } else {
        toast(result.error, 'error')
      }
    })
  }

  return (
    <div className="space-y-6">
      <Panel className="space-y-4">
        <h2 className="font-bold">게스트 토큰 발급</h2>
        <Input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="발급 메모 (예: 2026 여름 MT)"
          maxLength={40}
        />
        <div className="grid grid-cols-4 gap-2">
          {EXPIRY_PRESETS.map((preset) => (
            <Button
              key={preset.label}
              type="button"
              size="sm"
              variant={hours === preset.hours ? 'primary' : 'surface'}
              className={hours === preset.hours ? '' : 'border border-white/10'}
              onClick={() => setHours(preset.hours)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
        <Button
          type="button"
          variant="primary"
          className="w-full"
          disabled={isPending || !label.trim()}
          disabledReason={!label.trim() ? '발급 메모를 입력하세요' : undefined}
          onClick={issue}
        >
          토큰 발급
        </Button>
      </Panel>

      <Panel className="space-y-3">
        <h2 className="font-bold">발급된 토큰</h2>
        {tokens.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">발급된 토큰이 없습니다</p>
        ) : (
          <ul className="space-y-2">
            {tokens.map((token) => {
              const expired = token.expiresAt !== null && Date.parse(token.expiresAt) < Date.now()
              const dead = token.revokedAt !== null || expired
              return (
                <li
                  key={token.id}
                  className="flex items-center justify-between gap-3 rounded-xl bg-bg-deep/60 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-lg font-bold tracking-[0.2em]">
                      {dead ? <s className="opacity-50">{token.code}</s> : token.code}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {token.label} · {token.createdByName} ·{' '}
                      {token.expiresAt
                        ? `${new Date(token.expiresAt).toLocaleDateString('ko-KR')} 까지`
                        : '무기한'}
                    </p>
                  </div>
                  {token.revokedAt ? (
                    <Badge tone="muted">회수됨</Badge>
                  ) : expired ? (
                    <Badge tone="muted">만료됨</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={isPending}
                      onClick={() => setRevokeTarget(token)}
                    >
                      회수
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      <Panel className="space-y-3">
        <h2 className="font-bold">관리자 관리</h2>
        <ul className="space-y-2">
          {users.map((user) => (
            <li
              key={user.id}
              className="flex items-center justify-between gap-3 rounded-xl bg-bg-deep/60 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 font-bold">
                  <span className="truncate">{user.displayName}</span>
                  {user.isAdmin ? <Badge tone="accent">관리자</Badge> : null}
                  {user.isGuest ? <Badge tone="muted">게스트</Badge> : null}
                </p>
                <p className="text-xs text-muted">
                  {user.username ?? '아이디 없음'}
                  {user.phoneMasked ? ` · ${user.phoneMasked}` : ''}
                </p>
              </div>
              <Button
                size="sm"
                variant={user.isAdmin ? 'danger' : 'surface'}
                className={user.isAdmin ? '' : 'border border-white/10'}
                disabled={isPending || (user.id === selfId && user.isAdmin) || user.isGuest}
                disabledReason={
                  user.id === selfId && user.isAdmin
                    ? '자기 자신의 권한은 해제할 수 없습니다'
                    : user.isGuest
                      ? '게스트 계정은 관리자로 지정할 수 없습니다'
                      : undefined
                }
                onClick={() => setAdminTarget(user)}
              >
                {user.isAdmin ? '해제' : '관리자 지정'}
              </Button>
            </li>
          ))}
        </ul>
      </Panel>

      <ConfirmDialog
        open={revokeTarget !== null}
        title={`토큰 ${revokeTarget?.code ?? ''} 을 회수할까요?`}
        body="회수하면 이 토큰으로는 더 이상 로그인할 수 없습니다. 이미 만든 게스트 계정은 유지됩니다."
        confirmLabel="회수"
        tone="danger"
        onConfirm={() => {
          const target = revokeTarget
          setRevokeTarget(null)
          if (!target) return
          startTransition(async () => {
            const result = await revokeGuestToken({ tokenId: target.id })
            if (result.success) {
              toast('토큰을 회수했습니다', 'success')
              router.refresh()
            } else {
              toast(result.error, 'error')
            }
          })
        }}
        onClose={() => setRevokeTarget(null)}
      />

      <ConfirmDialog
        open={adminTarget !== null}
        title={
          adminTarget?.isAdmin
            ? `${adminTarget.displayName} 님의 관리자 권한을 해제할까요?`
            : `${adminTarget?.displayName ?? ''} 님을 관리자로 지정할까요?`
        }
        body={
          adminTarget?.isAdmin
            ? '해제하면 게스트 토큰 발급과 관리자 지정을 할 수 없게 됩니다.'
            : '관리자는 게스트 토큰 발급과 다른 사용자의 관리자 지정을 할 수 있습니다.'
        }
        confirmLabel={adminTarget?.isAdmin ? '해제' : '지정'}
        tone={adminTarget?.isAdmin ? 'danger' : 'primary'}
        onConfirm={() => {
          const target = adminTarget
          setAdminTarget(null)
          if (!target) return
          startTransition(async () => {
            const result = await setAdmin({ targetUserId: target.id, isAdmin: !target.isAdmin })
            if (result.success) {
              toast('권한을 변경했습니다', 'success')
              router.refresh()
            } else {
              toast(result.error, 'error')
            }
          })
        }}
        onClose={() => setAdminTarget(null)}
      />
    </div>
  )
}
