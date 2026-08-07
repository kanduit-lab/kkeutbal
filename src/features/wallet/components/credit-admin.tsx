'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import type { AdminUserView } from '@/features/auth/admin-queries'
import { adminAdjustCredits } from '../actions'
import {
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Select,
  Sheet,
  useToast,
} from '@/components/ui'
import { translateError, useDict } from '@/lib/i18n/client'

const MAX_ADJUSTMENT = 1_000_000

/**
 * 크레딧 지급·회수 다이얼로그. 예전에는 회원 표 옆에 붙박이 패널이라 표가 20rem을
 * 통째로 빼앗겼고, 정작 상시로 쓰는 화면도 아니었다.
 *
 * `targetUserId`를 주면 그 회원으로 고정해 연다(회원 상세에서 호출). 없으면 목록에서 고른다.
 */
export function CreditAdminDialog({
  open,
  users,
  fixedUserId,
  onClose,
  onDataChanged,
}: {
  open: boolean
  users: readonly AdminUserView[]
  fixedUserId?: string
  onClose: () => void
  onDataChanged?: () => void
}) {
  const { d } = useDict()
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()
  const [targetUserId, setTargetUserId] = useState(fixedUserId ?? users[0]?.id ?? '')
  const [amountText, setAmountText] = useState('')
  const [reason, setReason] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)

  // 다이얼로그가 닫힌 채로 살아 있다가 다른 회원으로 다시 열릴 수 있다.
  // 열릴 때마다 대상과 입력을 초기화하지 않으면 앞사람 값이 그대로 남는다.
  useEffect(() => {
    if (!open) return
    setTargetUserId(fixedUserId ?? users[0]?.id ?? '')
    setAmountText('')
    setReason('')
  }, [open, fixedUserId, users])

  const amount = Number(amountText)
  const target = useMemo(
    () => users.find((user) => user.id === targetUserId) ?? null,
    [targetUserId, users],
  )
  const amountValid =
    Number.isSafeInteger(amount) && amount !== 0 && Math.abs(amount) <= MAX_ADJUSTMENT
  const reasonValid = reason.trim().length >= 1
  const valid = target !== null && amountValid && reasonValid
  const amountError =
    amountText.trim() !== '' && !amountValid ? d.wallet.admin.amountInvalid : undefined

  // 같은 입력을 다시 보내면 같은 요청 id를 재사용해 서버가 중복 확정을 흡수하게 한다.
  // 단 **확정된 뒤에는 반드시 버린다** — 안 버리면 "같은 사람에게 같은 금액을 같은 사유로
  // 한 번 더 지급"이 서버에서 기존 거래로 취급돼 잔액은 그대로인데 화면은 성공이라고 말한다.
  const requestIdRef = useRef<{ draft: string; id: string } | null>(null)
  function requestIdForDraft(): string {
    // 구분자는 NUL이다. 사유에 공백이나 하이픈이 들어가도 세 필드 경계가 흐려지지 않는다.
    // 원문에 NUL 바이트를 그대로 박으면 git이 이 파일을 binary로 보고 diff를 감춘다 —
    // 값은 같으니 이스케이프로 적는다.
    const draft = `${targetUserId}\0${amount}\0${reason.trim()}`
    if (!requestIdRef.current || requestIdRef.current.draft !== draft) {
      requestIdRef.current = { draft, id: crypto.randomUUID() }
    }
    return requestIdRef.current.id
  }

  function submit() {
    if (!valid || !target || isPending) return
    const requestId = requestIdForDraft()
    startTransition(async () => {
      const result = await adminAdjustCredits({
        requestId,
        targetUserId: target.id,
        amount,
        reason: reason.trim(),
      })
      if (result.success) {
        requestIdRef.current = null
        toast(amount > 0 ? d.wallet.admin.granted : d.wallet.admin.revokedToast, 'success')
        setAmountText('')
        setReason('')
        onDataChanged?.()
        onClose()
      } else {
        toast(translateError(d, result.error), 'error')
      }
    })
  }

  return (
    <>
      <Sheet open={open} onClose={onClose} ariaLabel={d.wallet.admin.title} width="lg">
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-bold">{d.wallet.admin.title}</h2>
            <p className="mt-1 text-sm text-muted">{d.wallet.admin.description}</p>
          </div>

          {users.length === 0 ? (
            <EmptyState title={d.wallet.admin.noUsers} hint={d.wallet.admin.noUsersHint} />
          ) : (
            <>
              {fixedUserId ? (
                <div className="rounded-xl bg-inset px-3 py-2">
                  <p className="font-bold">{target?.displayName ?? ''}</p>
                  <p className="text-xs text-muted">
                    {target?.username ? `${target.username} · ` : ''}
                    {d.wallet.admin.currentBalance} {target?.availableBalance.toLocaleString() ?? 0}
                  </p>
                </div>
              ) : (
                <Field label={d.wallet.admin.targetLabel}>
                  {(control) => (
                    <Select
                      {...control}
                      value={targetUserId}
                      onChange={(event) => setTargetUserId(event.target.value)}
                    >
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.displayName}
                          {user.username ? ` · ${user.username}` : ''} ·{' '}
                          {user.availableBalance.toLocaleString()}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              )}

              <Field label={d.wallet.admin.amountLabel} error={amountError}>
                {(control) => (
                  <Input
                    {...control}
                    type="number"
                    inputMode="numeric"
                    value={amountText}
                    onChange={(event) => setAmountText(event.target.value)}
                    min={-MAX_ADJUSTMENT}
                    max={MAX_ADJUSTMENT}
                    step={1}
                    placeholder={d.wallet.admin.amountPlaceholder}
                  />
                )}
              </Field>
              <Field label={d.wallet.admin.reasonLabel}>
                {(control) => (
                  <Input
                    {...control}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    maxLength={200}
                    placeholder={d.wallet.admin.reasonPlaceholder}
                  />
                )}
              </Field>

              <div className="grid grid-cols-2 gap-2">
                <Button variant="ghost" onClick={onClose} disabled={isPending}>
                  {d.common.cancel}
                </Button>
                <Button
                  type="button"
                  variant={amount < 0 ? 'danger' : 'primary'}
                  loading={isPending}
                  disabled={!valid}
                  disabledReason={!valid ? d.wallet.admin.incomplete : undefined}
                  onClick={() => setConfirmOpen(true)}
                >
                  {amount < 0 ? d.wallet.admin.revokeButton : d.wallet.admin.grantButton}
                </Button>
              </div>
            </>
          )}
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirmOpen}
        title={amount < 0 ? d.wallet.admin.revokeTitle : d.wallet.admin.grantTitle}
        body={
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <dt>{d.wallet.admin.confirmTarget}</dt>
              <dd className="font-bold text-text">{target?.displayName ?? ''}</dd>
              <dt>{d.wallet.admin.currentBalance}</dt>
              <dd className="font-bold tabular-nums text-text">
                {target?.availableBalance.toLocaleString() ?? ''}
              </dd>
              <dt>{d.wallet.admin.confirmAmount}</dt>
              <dd className="font-bold tabular-nums text-text">
                {amountValid ? amount.toLocaleString() : ''}
              </dd>
              <dt>{d.wallet.admin.confirmReason}</dt>
              <dd className="min-w-0 break-words text-text">
                {reason.trim() || d.wallet.admin.noReason}
              </dd>
            </dl>
            <p className="mt-2">{d.wallet.admin.consequence}</p>
          </>
        }
        confirmLabel={amount < 0 ? d.wallet.admin.revoke : d.wallet.admin.grant}
        confirmDisabled={!valid}
        tone={amount < 0 ? 'danger' : 'primary'}
        onConfirm={() => {
          setConfirmOpen(false)
          submit()
        }}
        onClose={() => setConfirmOpen(false)}
      />
    </>
  )
}
