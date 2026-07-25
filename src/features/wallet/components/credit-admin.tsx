'use client'

import { useMemo, useState, useTransition } from 'react'
import type { AdminUserView } from '@/features/auth/admin-queries'
import { adminAdjustCredits } from '../actions'
import { Button, ConfirmDialog, Field, Input, Panel, useToast } from '@/components/ui'

/** 관리자 지급/회수 표면. 입력값은 확인 대화상자 뒤에만 posting한다. */
export function CreditAdmin({
  users,
  onDataChanged,
}: {
  users: readonly AdminUserView[]
  onDataChanged?: () => void
}) {
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()
  const [targetUserId, setTargetUserId] = useState(users[0]?.id ?? '')
  const [amountText, setAmountText] = useState('')
  const [reason, setReason] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)

  const amount = Number(amountText)
  const target = useMemo(
    () => users.find((user) => user.id === targetUserId) ?? null,
    [targetUserId, users],
  )
  const valid =
    target !== null &&
    Number.isSafeInteger(amount) &&
    amount !== 0 &&
    Math.abs(amount) <= 1_000_000 &&
    reason.trim().length >= 1

  function submit() {
    if (!valid || !target) return
    startTransition(async () => {
      const result = await adminAdjustCredits({
        requestId: crypto.randomUUID(),
        targetUserId: target.id,
        amount,
        reason: reason.trim(),
      })
      if (result.success) {
        toast(amount > 0 ? '가상 크레딧을 지급했습니다' : '가상 크레딧을 회수했습니다', 'success')
        setAmountText('')
        setReason('')
        onDataChanged?.()
      } else {
        toast(result.error, 'error')
      }
    })
  }

  return (
    <>
      <Panel className="space-y-4">
        <div>
          <h2 className="font-bold">가상 크레딧 관리</h2>
          <p className="mt-1 text-sm text-muted">
            현금 가치·환전·출금이 없는 게임 전용 크레딧입니다. 모든 지급·회수는 사유와 함께 변경
            불가 원장에 남습니다.
          </p>
        </div>
        {users.length === 0 ? (
          <p className="rounded-xl bg-bg-deep/60 px-4 py-3 text-sm text-muted">
            조정할 사용자가 없습니다
          </p>
        ) : (
          <>
            <Field label="대상 사용자">
              <select
                value={targetUserId}
                onChange={(event) => setTargetUserId(event.target.value)}
                className="min-h-12 w-full rounded-xl border border-gold/15 bg-bg-deep/70 px-4 text-base text-text focus:border-gold/50 focus:outline-none"
              >
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.displayName} {user.username ? `(${user.username})` : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="조정 크레딧">
              <Input
                type="number"
                inputMode="numeric"
                value={amountText}
                onChange={(event) => setAmountText(event.target.value)}
                min={-1_000_000}
                max={1_000_000}
                step={1}
                placeholder="양수는 지급, 음수는 회수"
              />
            </Field>
            <Field label="사유 (거래 기록에 남음)">
              <Input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={200}
                placeholder="예: 7월 정기 모임 기본 크레딧"
              />
            </Field>
            <Button
              type="button"
              variant={amount < 0 ? 'danger' : 'primary'}
              className="w-full"
              disabled={isPending || !valid}
              disabledReason={!valid ? '대상, 0이 아닌 정수, 사유를 모두 입력하세요' : undefined}
              onClick={() => setConfirmOpen(true)}
            >
              {amount < 0 ? '가상 크레딧 회수 확인' : '가상 크레딧 지급 확인'}
            </Button>
          </>
        )}
      </Panel>

      <ConfirmDialog
        open={confirmOpen}
        title={amount < 0 ? '가상 크레딧을 회수할까요?' : '가상 크레딧을 지급할까요?'}
        body={`${target?.displayName ?? '선택한 사용자'} · ${amount.toLocaleString()} 크레딧 · ${reason.trim() || '사유 없음'}\n이 작업은 기존 잔액을 수정하지 않고 새 원장 거래를 만듭니다.`}
        confirmLabel={amount < 0 ? '회수' : '지급'}
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
