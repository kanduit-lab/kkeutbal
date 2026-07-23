'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  adminCloseRoom,
  createGuestToken,
  createRegistrationCode,
  revokeGuestToken,
  revokeRegistrationCode,
  setAdmin,
} from '../admin-actions'
import type {
  AdminRoomView,
  AdminUserView,
  GuestTokenView,
  RegistrationCodeView,
} from '../admin-queries'
import { Badge, Button, ConfirmDialog, Input, Panel, useToast } from '@/components/ui'
import { GAME_BADGE_TONE, GAME_LABELS } from '@/features/game/components/shared'

const EXPIRY_PRESETS = [
  { label: '24시간', hours: 24 },
  { label: '3일', hours: 72 },
  { label: '7일', hours: 168 },
  { label: '무기한', hours: 0 },
] as const

/** 방 생성 후 경과 시간 — 방치 여부 판단용이라 분/시간/일 단위면 충분하다. */
function formatAge(createdAt: string): string {
  const minutes = Math.floor((Date.now() - Date.parse(createdAt)) / 60_000)
  if (minutes < 1) return '방금 전'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  return `${Math.floor(hours / 24)}일 전`
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('ko-KR')
}

function accountTypeLabel(type: AdminUserView['authType']): string {
  if (type === 'internal') return '내부 계정'
  if (type === 'sso') return 'SSO'
  return '게스트'
}

export function AdminClient({
  tokens,
  registrationCodes,
  users,
  rooms,
  selfId,
  bootstrapRegistrationCodeEnabled,
}: {
  tokens: readonly GuestTokenView[]
  registrationCodes: readonly RegistrationCodeView[]
  users: readonly AdminUserView[]
  rooms: readonly AdminRoomView[]
  selfId: string
  bootstrapRegistrationCodeEnabled: boolean
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()

  const [label, setLabel] = useState('')
  const [hours, setHours] = useState<number>(72)
  const [registrationLabel, setRegistrationLabel] = useState('')
  const [registrationHours, setRegistrationHours] = useState<number>(72)
  const [latestRegistrationCode, setLatestRegistrationCode] = useState<string | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<GuestTokenView | null>(null)
  const [revokeRegistrationTarget, setRevokeRegistrationTarget] = useState<RegistrationCodeView | null>(
    null,
  )
  const [adminTarget, setAdminTarget] = useState<AdminUserView | null>(null)
  const [closeTarget, setCloseTarget] = useState<AdminRoomView | null>(null)
  const [memberQuery, setMemberQuery] = useState('')

  const normalizedMemberQuery = memberQuery.trim().toLowerCase()
  const filteredUsers = normalizedMemberQuery
    ? users.filter((user) =>
        [user.displayName, user.username ?? '', user.phoneMasked ?? ''].some((value) =>
          value.toLowerCase().includes(normalizedMemberQuery),
        ),
      )
    : users

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

  function issueRegistrationCode() {
    if (isPending || !registrationLabel.trim()) return
    startTransition(async () => {
      const result = await createRegistrationCode({
        label: registrationLabel.trim(),
        expiresInHours: registrationHours,
      })
      if (result.success) {
        setLatestRegistrationCode(result.data.code)
        setRegistrationLabel('')
        toast('가입코드를 발급했습니다. 지금 복사해 전달하세요.', 'success')
        router.refresh()
      } else {
        toast(result.error, 'error')
      }
    })
  }

  return (
    <div className="space-y-6">
      <Panel className="space-y-4">
        <div>
          <h2 className="font-bold">가입코드 발급</h2>
          <p className="mt-1 text-sm text-muted">발급한 코드는 이 화면에서 한 번만 확인할 수 있습니다</p>
        </div>
        <Input
          value={registrationLabel}
          onChange={(event) => setRegistrationLabel(event.target.value)}
          placeholder="발급 메모 (예: 2026 여름 MT)"
          maxLength={40}
        />
        <div className="grid grid-cols-4 gap-2">
          {EXPIRY_PRESETS.map((preset) => (
            <Button
              key={preset.label}
              type="button"
              size="sm"
              variant={registrationHours === preset.hours ? 'primary' : 'surface'}
              className={registrationHours === preset.hours ? '' : 'border border-white/10'}
              onClick={() => setRegistrationHours(preset.hours)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
        <Button
          type="button"
          variant="primary"
          className="w-full"
          disabled={isPending || !registrationLabel.trim()}
          disabledReason={!registrationLabel.trim() ? '발급 메모를 입력하세요' : undefined}
          onClick={issueRegistrationCode}
        >
          가입코드 발급
        </Button>
        {latestRegistrationCode ? (
          <div className="rounded-xl bg-bg-deep/60 p-3">
            <p className="text-xs text-muted">방금 발급한 가입코드</p>
            <div className="mt-1 flex items-center justify-between gap-3">
              <code className="font-mono text-lg font-bold tracking-[0.18em]">{latestRegistrationCode}</code>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  if (!navigator.clipboard) {
                    toast('복사를 지원하지 않는 브라우저입니다', 'error')
                    return
                  }
                  void navigator.clipboard
                    .writeText(latestRegistrationCode)
                    .then(() => toast('가입코드를 복사했습니다', 'success'))
                    .catch(() => toast('복사하지 못했습니다. 코드를 직접 선택하세요', 'error'))
                }}
              >
                복사
              </Button>
            </div>
          </div>
        ) : null}
      </Panel>

      <Panel className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-bold">가입코드 관리</h2>
          {bootstrapRegistrationCodeEnabled ? <Badge tone="warn">비상 코드 사용 중</Badge> : null}
        </div>
        {bootstrapRegistrationCodeEnabled ? (
          <p className="text-sm text-muted">환경변수 비상 코드는 이 화면에서 회수할 수 없습니다</p>
        ) : null}
        {registrationCodes.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">발급된 가입코드가 없습니다</p>
        ) : (
          <ul className="space-y-2">
            {registrationCodes.map((code) => {
              const expired = code.expiresAt !== null && Date.parse(code.expiresAt) < Date.now()
              return (
                <li
                  key={code.id}
                  className="flex items-center justify-between gap-3 rounded-xl bg-bg-deep/60 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate font-bold">{code.label}</p>
                    <p className="truncate text-xs text-muted">
                      {code.createdByName} · {formatDate(code.createdAt)} ·{' '}
                      {code.expiresAt ? `${formatDate(code.expiresAt)} 까지` : '무기한'}
                    </p>
                  </div>
                  {code.revokedAt ? (
                    <Badge tone="muted">회수됨</Badge>
                  ) : expired ? (
                    <Badge tone="muted">만료됨</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={isPending}
                      onClick={() => setRevokeRegistrationTarget(code)}
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
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-bold">회원 관리</h2>
          <Badge tone="muted">{filteredUsers.length}명</Badge>
        </div>
        <Input
          value={memberQuery}
          onChange={(event) => setMemberQuery(event.target.value)}
          placeholder="이름, 아이디, 전화번호 뒷자리 검색"
          maxLength={20}
        />
        {filteredUsers.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">일치하는 회원이 없습니다</p>
        ) : (
          <ul className="space-y-2">
            {filteredUsers.map((user) => (
              <li key={user.id} className="rounded-xl bg-bg-deep/60 px-3 py-2.5">
                <p className="flex items-center gap-1.5 font-bold">
                  <span className="truncate">{user.displayName}</span>
                  <Badge tone="muted">{accountTypeLabel(user.authType)}</Badge>
                  {user.isAdmin ? <Badge tone="accent">관리자</Badge> : null}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {user.username ?? '아이디 없음'}
                  {user.phoneMasked ? ` · ${user.phoneMasked}` : ''} · {formatDate(user.createdAt)} 가입
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel className="space-y-3">
        <h2 className="font-bold">권한 관리</h2>
        <ul className="space-y-2">
          {filteredUsers.map((user) => (
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

      <Panel className="space-y-3">
        <h2 className="font-bold">진행 중인 방</h2>
        {rooms.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">진행 중인 방이 없습니다</p>
        ) : (
          <ul className="space-y-2">
            {rooms.map((room) => (
              <li
                key={room.id}
                className="flex items-center justify-between gap-3 rounded-xl bg-bg-deep/60 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-bold">
                    <span className="font-mono tracking-widest">{room.code}</span>
                    <span className="truncate">{room.name}</span>
                    <Badge tone={GAME_BADGE_TONE[room.gameType]}>
                      {GAME_LABELS[room.gameType].name}
                    </Badge>
                  </p>
                  <p className="truncate text-xs text-muted">
                    방장 {room.hostName} · {room.memberCount}명 · {formatAge(room.createdAt)} 생성
                    {room.status === 'playing' ? ' · 판 진행 중' : ''}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={isPending}
                  onClick={() => setCloseTarget(room)}
                >
                  강제 정산
                </Button>
              </li>
            ))}
          </ul>
        )}
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
        open={revokeRegistrationTarget !== null}
        title={`가입코드 ${revokeRegistrationTarget?.label ?? ''} 을 회수할까요?`}
        body="회수하면 이 코드로 새 계정을 만들 수 없습니다. 이미 가입한 계정에는 영향이 없습니다."
        confirmLabel="회수"
        tone="danger"
        onConfirm={() => {
          const target = revokeRegistrationTarget
          setRevokeRegistrationTarget(null)
          if (!target) return
          startTransition(async () => {
            const result = await revokeRegistrationCode({ codeId: target.id })
            if (result.success) {
              toast('가입코드를 회수했습니다', 'success')
              router.refresh()
            } else {
              toast(result.error, 'error')
            }
          })
        }}
        onClose={() => setRevokeRegistrationTarget(null)}
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

      <ConfirmDialog
        open={closeTarget !== null}
        title="방을 강제 정산할까요?"
        body="진행 중인 판은 무효 처리됩니다."
        confirmLabel="강제 정산"
        tone="danger"
        onConfirm={() => {
          const target = closeTarget
          setCloseTarget(null)
          if (!target) return
          startTransition(async () => {
            const result = await adminCloseRoom(target.id)
            if (result.success) {
              toast('방을 강제 정산했습니다', 'success')
              router.refresh()
            } else {
              toast(result.error, 'error')
            }
          })
        }}
        onClose={() => setCloseTarget(null)}
      />
    </div>
  )
}
