'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { verifyRegistrationCode } from '@/features/auth/actions'
import type { RegistrationCodeState } from '@/features/auth/actions'
import { Button, Input, SubmitButton } from '@/components/ui'
import { useDict } from '@/lib/i18n/client'

/** 회원가입 폼을 열기 전에 가입코드를 확인하는 로그인 카드용 폼. */
export function RegistrationCodeForm({ onCancel }: { onCancel: () => void }) {
  const { d } = useDict()
  const router = useRouter()
  const [state, formAction] = useActionState<RegistrationCodeState, FormData>(
    verifyRegistrationCode,
    { status: 'idle' },
  )

  useEffect(() => {
    if (state.status === 'success') router.replace('/register')
  }, [router, state.status])

  return (
    <form action={formAction} className="space-y-3">
      <Input
        name="code"
        aria-label={d.auth.registrationCodePlaceholder}
        placeholder={d.auth.registrationCodePlaceholder}
        maxLength={10}
        required
        autoComplete="off"
        autoCapitalize="characters"
        className="uppercase tracking-[0.2em]"
        autoFocus
      />
      {state.status === 'error' ? (
        <p role="alert" className="text-sm text-[#ff9a94]">
          {state.error === 'invalid' ? d.auth.registrationCodeInvalid : d.auth.registrationCodeUnavailable}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {d.common.cancel}
        </Button>
        <SubmitButton variant="primary" pendingLabel={d.auth.registrationCodePending}>
          {d.auth.registrationCodeSubmit}
        </SubmitButton>
      </div>
    </form>
  )
}
