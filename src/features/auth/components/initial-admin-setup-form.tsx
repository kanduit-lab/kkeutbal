'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { verifyInitialAdminSetupCode, type InitialAdminSetupState } from '@/features/auth/actions'
import { Alert, Button, Input, SubmitButton } from '@/components/ui'
import { useDict } from '@/lib/i18n/client'

/** 서버 콘솔의 1회용 코드를 검증한 브라우저만 최초 관리자 가입 화면으로 보낸다. */
export function InitialAdminSetupForm({ onCancel }: { onCancel: () => void }) {
  const { d } = useDict()
  const router = useRouter()
  const [state, formAction] = useActionState<InitialAdminSetupState, FormData>(
    verifyInitialAdminSetupCode,
    { status: 'idle' },
  )

  useEffect(() => {
    if (state.status === 'success') router.replace('/register')
  }, [router, state.status])

  return (
    <form action={formAction} className="space-y-3">
      <Input
        name="code"
        aria-label={d.auth.initialAdminCodeLabel}
        placeholder={d.auth.initialAdminCodePlaceholder}
        maxLength={19}
        required
        autoComplete="one-time-code"
        autoCapitalize="characters"
        className="uppercase tracking-[0.16em]"
        autoFocus
      />
      {state.status === 'error' ? (
        <Alert tone="error">
          {state.error === 'invalid' ? (
            <>
              <span className="block">{d.auth.initialAdminCodeInvalid}</span>
              <span className="block">{d.auth.initialAdminCodeRetry}</span>
            </>
          ) : (
            d.auth.initialAdminSetupUnavailable
          )}
        </Alert>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {d.common.cancel}
        </Button>
        <SubmitButton variant="primary" pendingLabel={d.auth.initialAdminCodePending}>
          {d.auth.initialAdminCodeSubmit}
        </SubmitButton>
      </div>
    </form>
  )
}
