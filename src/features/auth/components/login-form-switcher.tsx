'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
  firstAccount,
}: {
  redirectTo: string
  initialMode: LoginMode
  firstAccount: boolean
}) {
  const { d } = useDict()
  const router = useRouter()
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
            <h2 className="font-bold">초기 관리자 계정</h2>
            <p className="mt-1 text-sm text-muted">
              처음 실행입니다. 아이디와 비밀번호를 만들면 이 계정이 관리자가 됩니다.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="ghost" onClick={() => setMode('password')}>
              {d.common.cancel}
            </Button>
            <Button type="button" variant="primary" onClick={() => router.push('/register')}>
              관리자 만들기
            </Button>
          </div>
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
        {firstAccount ? '처음 설치인가요?' : d.auth.noAccount}{' '}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-0 px-0 py-0 font-bold text-text underline underline-offset-4"
          onClick={() => setMode('registration')}
        >
          {firstAccount ? '초기 관리자 만들기' : d.auth.registerLink}
        </Button>
      </p>
      <Button type="button" variant="ghost" className="w-full" onClick={() => setMode('guest')}>
        {d.auth.guestTokenSummary}
      </Button>
    </Panel>
  )
}
