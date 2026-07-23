'use client'

import { useState } from 'react'
import { loginWithGuestToken, loginWithPassword } from '@/features/auth/actions'
import { GuestNamePicker } from '@/features/auth/components/guest-name-picker'
import { RegistrationCodeForm } from '@/features/auth/components/registration-code-form'
import { Button, Input, Panel, SubmitButton } from '@/components/ui'
import { useDict } from '@/lib/i18n/client'

type LoginMode = 'password' | 'guest' | 'registration'

/** 로그인 카드 안에서 내부 계정과 게스트 토큰 폼을 전환한다. */
export function LoginFormSwitcher({
  redirectTo,
  initialMode,
}: {
  redirectTo: string
  initialMode: LoginMode
}) {
  const { d } = useDict()
  const [mode, setMode] = useState<LoginMode>(initialMode)

  if (mode === 'guest') {
    return (
      <Panel className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-bold">{d.auth.guestLoginTitle}</h2>
          <Button type="button" variant="ghost" size="sm" onClick={() => setMode('password')}>
            {d.auth.passwordLoginTitle}
          </Button>
        </div>
        <form className="space-y-3" action={loginWithGuestToken}>
          <input type="hidden" name="next" value={redirectTo} />
          <GuestNamePicker />
        </form>
      </Panel>
    )
  }

  if (mode === 'registration') {
    return (
      <Panel className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-bold">{d.auth.registrationCodeTitle}</h2>
          <Button type="button" variant="ghost" size="sm" onClick={() => setMode('password')}>
            {d.auth.passwordLoginTitle}
          </Button>
        </div>
        <RegistrationCodeForm onCancel={() => setMode('password')} />
      </Panel>
    )
  }

  return (
    <Panel className="space-y-4">
      <p className="font-bold">{d.auth.passwordLoginTitle}</p>
      <form className="space-y-3" action={loginWithPassword}>
        <input type="hidden" name="next" value={redirectTo} />
        <Input
          name="username"
          placeholder={d.auth.usernamePlaceholder}
          maxLength={20}
          required
          autoComplete="username"
        />
        <Input
          name="password"
          type="password"
          placeholder={d.auth.passwordPlaceholder}
          maxLength={72}
          required
          autoComplete="current-password"
        />
        <SubmitButton variant="primary" size="lg" className="w-full" pendingLabel={d.auth.loginPending}>
          {d.auth.login}
        </SubmitButton>
      </form>
      <p className="text-center text-sm text-muted">
        {d.auth.noAccount}{' '}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-0 px-0 py-0 font-bold text-text underline underline-offset-4"
          onClick={() => setMode('registration')}
        >
          {d.auth.registerLink}
        </Button>
      </p>
      <Button type="button" variant="ghost" className="w-full" onClick={() => setMode('guest')}>
        {d.auth.guestTokenSummary}
      </Button>
    </Panel>
  )
}
