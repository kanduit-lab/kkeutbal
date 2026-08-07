'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  Field,
  Input,
  Sheet,
  Skeleton,
  useToast,
} from '@/components/ui'
import { format, translateError, useDict } from '@/lib/i18n/client'
import {
  getMemberDetail,
  resetMemberPassword,
  setMemberStatus,
  updateMemberProfile,
} from '../../member-actions'
import type { MemberDetail, MemberStatus } from '../../member-types'
import { accountTypeLabel, formatDate } from './format'
import { MemberStatusBadge } from './member-status'

type StatusAction = 'suspend' | 'restore' | 'remove'

const STATUS_FOR_ACTION: Record<StatusAction, MemberStatus> = {
  suspend: 'suspended',
  restore: 'active',
  remove: 'deleted',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 rounded-2xl bg-inset p-3">
      <h3 className="text-sm font-black">{title}</h3>
      {children}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-surface-raised px-3 py-2">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 font-bold tabular-nums">{value}</p>
    </div>
  )
}

export function MemberDetailDialog({
  userId,
  selfId,
  reloadToken,
  onClose,
  onDataChanged,
  onAdjustCredits,
}: {
  userId: string | null
  selfId: string
  /** 바깥에서 이 회원의 데이터를 바꿨을 때 다시 읽게 하는 신호. 값이 바뀌면 재조회한다. */
  reloadToken: number
  onClose: () => void
  onDataChanged: () => void
  onAdjustCredits: (userId: string) => void
}) {
  const { d, locale } = useDict()
  const { toast } = useToast()
  const copy = d.adminConsole.memberDetail

  const [detail, setDetail] = useState<MemberDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const [displayName, setDisplayName] = useState('')
  const [phone, setPhone] = useState('')
  const [reason, setReason] = useState('')
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<StatusAction | 'password' | null>(null)

  const load = useCallback(
    (id: string) => {
      setLoadError(null)
      startTransition(async () => {
        const result = await getMemberDetail({ targetUserId: id })
        if (result.success) {
          setDetail(result.data)
          setDisplayName(result.data.displayName)
          // 마스킹된 값은 되돌려 보낼 수 없다. 관리자가 새로 입력할 때만 전화번호가 바뀐다.
          setPhone('')
        } else {
          setDetail(null)
          setLoadError(result.error)
        }
      })
    },
    [],
  )

  useEffect(() => {
    if (!userId) {
      setDetail(null)
      setTempPassword(null)
      setReason('')
      return
    }
    load(userId)
  }, [userId, reloadToken, load])

  function runStatus(action: StatusAction) {
    if (!detail) return
    setConfirmAction(null)
    startTransition(async () => {
      const result = await setMemberStatus({
        targetUserIds: [detail.id],
        status: STATUS_FOR_ACTION[action],
        reason: reason.trim(),
      })
      if (!result.success) {
        toast(translateError(d, result.error), 'error')
        return
      }
      const failure = result.data.failed[0]
      if (failure) {
        toast(translateError(d, failure.error), 'error')
        return
      }
      toast(copy.statusChanged, 'success')
      setReason('')
      onDataChanged()
      load(detail.id)
    })
  }

  function runPasswordReset() {
    if (!detail) return
    setConfirmAction(null)
    startTransition(async () => {
      const result = await resetMemberPassword({ targetUserId: detail.id })
      if (result.success) setTempPassword(result.data.tempPassword)
      else toast(translateError(d, result.error), 'error')
    })
  }

  function saveProfile() {
    if (!detail) return
    startTransition(async () => {
      const result = await updateMemberProfile({
        targetUserId: detail.id,
        displayName: displayName.trim(),
        phone: phone.trim(),
      })
      if (!result.success) {
        toast(translateError(d, result.error), 'error')
        return
      }
      toast(copy.saved, 'success')
      onDataChanged()
      load(detail.id)
    })
  }

  const isSelf = detail?.id === selfId
  const isDeleted = detail?.status === 'deleted'
  const nameValid = displayName.trim().length >= 1 && displayName.trim().length <= 20
  const phoneValid = phone.trim() === '' || /^01[016789]\d{7,8}$/.test(phone.replace(/\D/g, ''))
  const reasonMissing = reason.trim() === ''

  return (
    <>
      <Sheet open={userId !== null} onClose={onClose} ariaLabel={copy.ariaLabel} width="xl">
        {!detail ? (
          loadError ? (
            <div className="space-y-3">
              <Alert tone="error">{translateError(d, loadError)}</Alert>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="ghost" onClick={onClose}>
                  {copy.close}
                </Button>
                <Button variant="primary" onClick={() => userId && load(userId)}>
                  {d.common.retry}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3" role="status" aria-live="polite">
              <span className="sr-only">{d.common.loading}</span>
              <Skeleton className="h-7 w-40" />
              <Skeleton className="h-24" radius="xl" />
              <Skeleton className="h-32" radius="xl" />
            </div>
          )
        ) : (
          <div className="space-y-4">
            <header className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="flex flex-wrap items-center gap-2 text-lg font-black">
                  <span className="truncate">{detail.displayName}</span>
                  {detail.isAdmin ? (
                    <Badge tone="accent">{d.adminConsole.members.adminBadge}</Badge>
                  ) : null}
                  <MemberStatusBadge status={detail.status} d={d} />
                </h2>
                <p className="mt-0.5 text-sm text-muted">
                  {accountTypeLabel(d, detail.authType)}
                  {detail.username ? ` · ${detail.username}` : ''}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={onClose}>
                {copy.close}
              </Button>
            </header>

            {detail.status !== 'active' ? (
              <Alert tone={detail.status === 'deleted' ? 'error' : 'warn'}>
                <p className="font-bold">
                  {detail.statusChangedAt
                    ? format(
                        detail.status === 'deleted'
                          ? d.adminConsole.status.deletedSince
                          : d.adminConsole.status.suspendedSince,
                        { date: formatDate(locale, detail.statusChangedAt) },
                      )
                    : d.adminConsole.status[detail.status]}
                </p>
                {detail.statusReason ? (
                  <p className="mt-0.5 text-sm">
                    {d.adminConsole.status.reasonLabel}: {detail.statusReason}
                  </p>
                ) : null}
                {detail.statusChangedByName ? (
                  <p className="text-xs text-muted">
                    {format(d.adminConsole.status.changedBy, {
                      name: detail.statusChangedByName,
                    })}
                  </p>
                ) : null}
              </Alert>
            ) : null}

            <Section title={copy.overviewTitle}>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted">{copy.usernameLabel}</dt>
                <dd className="font-bold">
                  {detail.username ?? d.adminConsole.members.noUsername}
                </dd>
                <dt className="text-muted">{copy.phoneLabel}</dt>
                <dd className="font-bold">{detail.phoneMasked ?? copy.phoneNotSet}</dd>
                <dt className="text-muted">{copy.passwordLabel}</dt>
                <dd className="font-bold">
                  {detail.hasPassword ? copy.passwordSet : copy.passwordUnset}
                </dd>
                <dt className="text-muted">{copy.joinedLabel}</dt>
                <dd className="font-bold">{formatDate(locale, detail.createdAt)}</dd>
              </dl>
            </Section>

            <Section title={copy.creditsTitle}>
              <div className="grid grid-cols-2 gap-2">
                <Stat
                  label={copy.creditAvailable}
                  value={detail.availableBalance.toLocaleString()}
                />
                <Stat label={copy.creditLocked} value={detail.lockedBalance.toLocaleString()} />
              </div>
              <Button
                variant="surface"
                className="w-full"
                disabled={isDeleted}
                disabledReason={isDeleted ? copy.deletedLocked : undefined}
                onClick={() => onAdjustCredits(detail.id)}
              >
                {copy.creditAdjust}
              </Button>
              <div className="space-y-1">
                <p className="text-xs font-bold text-muted">{copy.historyTitle}</p>
                {detail.transactions.length === 0 ? (
                  <p className="py-2 text-center text-xs text-muted">{copy.historyEmpty}</p>
                ) : (
                  <ul className="max-h-44 space-y-1 overflow-y-auto overscroll-contain">
                    {detail.transactions.map((entry) => (
                      <li
                        key={entry.id}
                        className="flex items-center justify-between gap-3 rounded-lg bg-surface-raised px-2.5 py-1.5 text-xs"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-bold">{entry.reason}</span>
                          <span className="text-muted">
                            {formatDate(locale, entry.createdAt)} ·{' '}
                            {d.wallet.kind[creditKindKey(entry.kind)]}
                          </span>
                        </span>
                        <span
                          className={`shrink-0 font-bold tabular-nums ${
                            entry.deltaAvailable < 0 ? 'text-lose' : 'text-win'
                          }`}
                        >
                          {entry.deltaAvailable > 0 ? '+' : ''}
                          {entry.deltaAvailable.toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Section>

            <Section title={copy.roomsTitle}>
              <div className="grid grid-cols-3 gap-2">
                <Stat label={copy.roomsJoined} value={detail.roomsJoined} />
                <Stat label={copy.roomsActive} value={detail.roomsActive} />
                <Stat label={copy.roomsHosted} value={detail.roomsHosted} />
              </div>
            </Section>

            <Section title={copy.profileTitle}>
              {detail.isGuest ? (
                <p className="text-sm text-muted">{copy.guestImmutable}</p>
              ) : (
                <>
                  <Field label={copy.displayNameLabel} hint={copy.displayNameHint}>
                    {(control) => (
                      <Input
                        {...control}
                        value={displayName}
                        onChange={(event) => setDisplayName(event.target.value)}
                        maxLength={20}
                        disabled={isDeleted}
                      />
                    )}
                  </Field>
                  <Field
                    label={copy.phoneEditLabel}
                    hint={copy.phoneEditHint}
                    error={phoneValid ? undefined : copy.phoneInvalid}
                  >
                    {(control) => (
                      <Input
                        {...control}
                        value={phone}
                        onChange={(event) => setPhone(event.target.value)}
                        inputMode="numeric"
                        maxLength={13}
                        placeholder={detail.phoneMasked ?? copy.phoneNotSet}
                        disabled={isDeleted}
                      />
                    )}
                  </Field>
                  <Button
                        variant="primary"
                    className="w-full"
                    loading={isPending}
                    disabled={isDeleted || !nameValid || !phoneValid}
                    disabledReason={isDeleted ? copy.deletedLocked : undefined}
                    onClick={saveProfile}
                  >
                    {copy.save}
                  </Button>
                </>
              )}
            </Section>

            <Section title={copy.passwordTitle}>
              {detail.username && !detail.isGuest ? (
                <>
                  <p className="text-sm text-muted">{copy.passwordHint}</p>
                  {tempPassword ? (
                    <Alert tone="warn">
                      <p className="text-xs font-bold">{copy.tempPasswordLabel}</p>
                      <p className="mt-1 select-all break-all font-mono text-base font-black">
                        {tempPassword}
                      </p>
                      <p className="mt-1 text-xs">{copy.tempPasswordWarning}</p>
                    </Alert>
                  ) : null}
                  <Button
                        variant="outline"
                    className="w-full"
                    loading={isPending}
                    disabled={isDeleted}
                    disabledReason={isDeleted ? copy.deletedLocked : undefined}
                    onClick={() => setConfirmAction('password')}
                  >
                    {copy.passwordReset}
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted">{copy.passwordNoLogin}</p>
              )}
            </Section>

            <Section title={copy.statusTitle}>
              {isSelf ? (
                <p className="text-sm text-muted">{copy.selfLocked}</p>
              ) : isDeleted ? (
                <p className="text-sm text-muted">{copy.deletedLocked}</p>
              ) : (
                <>
                  <Field label={copy.reasonLabel}>
                    {(control) => (
                      <Input
                        {...control}
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        maxLength={200}
                        placeholder={copy.reasonPlaceholder}
                      />
                    )}
                  </Field>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {detail.status === 'suspended' ? (
                      <Button
                                variant="win"
                        loading={isPending}
                        onClick={() => setConfirmAction('restore')}
                      >
                        {copy.restore}
                      </Button>
                    ) : (
                      <Button
                                variant="danger"
                        loading={isPending}
                        disabled={reasonMissing}
                        disabledReason={reasonMissing ? copy.reasonRequired : undefined}
                        onClick={() => setConfirmAction('suspend')}
                      >
                        {copy.suspend}
                      </Button>
                    )}
                    <Button
                            variant="danger"
                      loading={isPending}
                      disabled={reasonMissing}
                      disabledReason={reasonMissing ? copy.reasonRequired : undefined}
                      onClick={() => setConfirmAction('remove')}
                    >
                      {copy.remove}
                    </Button>
                  </div>
                </>
              )}
            </Section>
          </div>
        )}
      </Sheet>

      <ConfirmDialog
        open={confirmAction !== null}
        title={format(confirmTitle(copy, confirmAction), { name: detail?.displayName ?? '' })}
        body={confirmBody(copy, confirmAction)}
        confirmLabel={confirmLabel(copy, d.common.confirm, confirmAction)}
        tone={confirmAction === 'restore' ? 'primary' : 'danger'}
        onConfirm={() => {
          if (confirmAction === 'password') runPasswordReset()
          else if (confirmAction) runStatus(confirmAction)
        }}
        onClose={() => setConfirmAction(null)}
      />
    </>
  )
}

type DetailCopy = ReturnType<typeof useDict>['d']['adminConsole']['memberDetail']

function confirmTitle(copy: DetailCopy, action: StatusAction | 'password' | null): string {
  switch (action) {
    case 'suspend':
      return copy.suspendTitle
    case 'restore':
      return copy.restoreTitle
    case 'remove':
      return copy.removeTitle
    case 'password':
      return copy.passwordResetTitle
    default:
      return ''
  }
}

function confirmBody(copy: DetailCopy, action: StatusAction | 'password' | null): string {
  switch (action) {
    case 'suspend':
      return copy.suspendBody
    case 'restore':
      return copy.restoreBody
    case 'remove':
      return copy.removeBody
    case 'password':
      return copy.passwordResetBody
    default:
      return ''
  }
}

function confirmLabel(
  copy: DetailCopy,
  fallback: string,
  action: StatusAction | 'password' | null,
): string {
  switch (action) {
    case 'suspend':
      return copy.suspend
    case 'restore':
      return copy.restore
    case 'remove':
      return copy.remove
    case 'password':
      return copy.passwordResetConfirm
    default:
      return fallback
  }
}

/** 원장 종류(snake)와 사전 키(camel)를 잇는다. */
function creditKindKey(
  kind: 'admin_grant' | 'admin_revoke' | 'room_lock' | 'room_settlement' | 'correction',
): 'adminGrant' | 'adminRevoke' | 'roomLock' | 'roomSettlement' | 'correction' {
  switch (kind) {
    case 'admin_grant':
      return 'adminGrant'
    case 'admin_revoke':
      return 'adminRevoke'
    case 'room_lock':
      return 'roomLock'
    case 'room_settlement':
      return 'roomSettlement'
    case 'correction':
      return 'correction'
  }
}
