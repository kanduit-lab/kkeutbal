'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { verifyRegistrationCode } from '@/features/auth/actions'
import type { RegistrationCodeState } from '@/features/auth/actions'
import { Alert, Button, Input, SubmitButton } from '@/components/ui'
import { useDict } from '@/lib/i18n/client'

export function RegistrationCodeForm({
  next = '/',
  onCancel,
}: {
  next?: string
  onCancel: () => void
}) {
  const { d } = useDict()
  const router = useRouter()
  const [state, formAction] = useActionState<RegistrationCodeState, FormData>(
    verifyRegistrationCode,
    { status: 'idle' },
  )

  useEffect(() => {
    if (state.status !== 'success') return
    const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/'
    router.replace(
      safeNext === '/' ? '/register' : `/register?next=${encodeURIComponent(safeNext)}`,
    )
  }, [next, router, state.status])

  return (
    <form action={formAction} className="space-y-3">
      <Input
        name="code"
        aria-label={d.auth.registrationCodePlaceholder}
        placeholder={d.auth.registrationCodePlaceholder}
        maxLength={10}
        required
        autoComplete="one-time-code"
        autoCapitalize="characters"
        className="uppercase tracking-[0.2em]"
        autoFocus
      />
      {state.status === 'error' ? (
        <Alert tone="error">
          {state.error === 'invalid'
            ? d.auth.registrationCodeInvalid
            : d.auth.registrationCodeUnavailable}
        </Alert>
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