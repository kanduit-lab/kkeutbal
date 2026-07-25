'use client'

import { useState } from 'react'
import { loginWithGuestToken, loginWithPassword } from '@/features/auth/actions'
import { GuestNamePicker } from '@/features/auth/components/guest-name-picker'
import { RegistrationCodeForm } from '@/features/auth/components/registration-code-form'
import { InitialAdminSetupForm } from '@/features/auth/components/initial-admin-setup-form'
import { Button, Input, Panel, SubmitButton } from '@/components/ui'
import { useDict } from '@/lib/i18n/client'

type LoginMode = 'password' | 'guest' | 'registration'

/** 로그인 카드 안에서 내부 계정과 게스트 토큰 폼을 전환한다. */
export function LoginFormSwitcher({
  redirectTo,
  initialMode,
  firstAccount,
  initialAdminSetupReady,
}: {
  redirectTo: string
  initialMode: LoginMode
  firstAccount: boolean
  initialAdminSetupReady: boolean
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
    if (firstAccount) {
      return (
        <Panel className="space-y-4">
          <div>
            <h2 className="font-bold">{d.auth.initialAdminTitle}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              <span className="block">{d.auth.initialAdminDescription}</span>
              <span className="block">{d.auth.initialAdminCodeHint}</span>
              <span className="block">{d.auth.initialAdminCodeExpiryHint}</span>
            </p>
          </div>
          {initialAdminSetupReady ? (
            <InitialAdminSetupForm onCancel={() => setMode('password')} />
          ) : (
            <div className="space-y-3">
              <p role="alert" className="text-sm text-[#ff9a94]">
                {d.auth.initialAdminSetupUnavailable}
              </p>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setMode('password')}
              >
                {d.common.cancel}
              </Button>
            </div>
          )}
        </Panel>
      )
    }
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
        <SubmitButton
          variant="primary"
          size="lg"
          className="w-full"
          pendingLabel={d.auth.loginPending}
        >
          {d.auth.login}
        </SubmitButton>
      </form>
      <p className="text-center text-sm text-muted">
        {firstAccount ? d.auth.initialAdminQuestion : d.auth.noAccount}{' '}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-0 px-0 py-0 font-bold text-text underline underline-offset-4"
          onClick={() => setMode('registration')}
        >
          {firstAccount ? d.auth.initialAdminLink : d.auth.registerLink}
        </Button>
      </p>
      <Button type="button" variant="ghost" className="w-full" onClick={() => setMode('guest')}>
        {d.auth.guestTokenSummary}
      </Button>
    </Panel>
  )
}
