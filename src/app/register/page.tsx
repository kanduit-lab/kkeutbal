import Link from 'next/link'
import { redirect } from 'next/navigation'
import { registerAndLogin } from '@/features/auth/actions'
import { hasRegistrationAccess } from '@/features/auth/registration-access'
import { isFirstAccount } from '@/features/auth/bootstrap'
import { Alert, Field, Input, PageShell, Panel, SubmitButton } from '@/components/ui'
import { PhoneInput } from '@/features/auth/components/phone-input'
import { PasswordInput } from '@/features/auth/components/password-input'
import { getDict, type Dictionary } from '@/lib/i18n/server'

/**
 * ?error= 코드 → 문구 화이트리스트. 매핑에 없는 코드나 임의 주입 텍스트는
 * 일반 문구로 떨어진다 — 쿼리 원문은 절대 그대로 렌더하지 않는다.
 */
function registerErrorCopy(d: Dictionary): Record<string, string> {
  return {
    validation: d.auth.errorValidation,
    validation_username: d.auth.errorUsername,
    validation_password: d.auth.errorPassword,
    validation_name: d.auth.errorName,
    validation_phone: d.auth.errorPhone,
    password_mismatch: d.auth.errorPasswordMismatch,
    username_taken: d.auth.errorUsernameTaken,
    phone_taken: d.auth.errorPhoneTaken,
    register_failed: d.auth.errorRegisterFailed,
  }
}

type RegisterField = 'username' | 'password' | 'passwordConfirm' | 'name' | 'phone'

const REGISTER_FIELDS: readonly RegisterField[] = [
  'username',
  'password',
  'passwordConfirm',
  'name',
  'phone',
]

/**
 * 필드별 기본 문구. 에러를 그 필드에 붙여야 스크린리더가 "이 필드의 문제"로 읽고,
 * 시각 사용자도 다섯 필드 떨어진 배너를 찾아 헤매지 않는다.
 */
function fieldCopy(d: Dictionary): Record<RegisterField, string> {
  return {
    username: d.auth.errorUsername,
    password: d.auth.errorPassword,
    passwordConfirm: d.auth.errorPasswordMismatch,
    name: d.auth.errorName,
    phone: d.auth.errorPhone,
  }
}

/** 에러 코드가 특정 필드를 가리키면 그 필드 — 아니면 상단 배너로 남긴다. */
function errorField(code: string | undefined): RegisterField | null {
  switch (code) {
    case 'validation_username':
    case 'username_taken':
      return 'username'
    case 'validation_password':
      return 'password'
    case 'password_mismatch':
      return 'passwordConfirm'
    case 'validation_name':
      return 'name'
    case 'validation_phone':
    case 'phone_taken':
      return 'phone'
    default:
      return null
  }
}

/** `?invalid=` 목록 파싱 — 화이트리스트 밖 값은 버린다 (쿼리 주입 방지). */
function parseInvalid(raw: string | undefined): readonly RegisterField[] {
  if (!raw) return []
  return raw
    .split(',')
    .filter((name): name is RegisterField => (REGISTER_FIELDS as readonly string[]).includes(name))
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string
    username?: string
    name?: string
    next?: string
    invalid?: string
  }>
}) {
  const [accessGranted, { error, username, name, next, invalid }, { d }, firstAccount] =
    await Promise.all([hasRegistrationAccess(), searchParams, getDict(), isFirstAccount()])
  if (!accessGranted) {
    redirect(
      firstAccount
        ? '/login?error=initial_admin_setup_required&mode=registration'
        : '/login?error=registration_code_required',
    )
  }
  const errorMessage = error ? (registerErrorCopy(d)[error] ?? d.auth.errorRequestFailed) : null
  const primaryField = errorField(error)
  // 서버가 잘못된 필드 전부를 돌려주므로 한 번의 왕복으로 모두 표시한다.
  const invalidFields = new Set<RegisterField>(parseInvalid(invalid))
  if (primaryField) invalidFields.add(primaryField)
  const firstInvalid = REGISTER_FIELDS.find((field) => invalidFields.has(field)) ?? null
  const copy = fieldCopy(d)
  // 필드에 붙는 에러는 그 필드에서만 보여 준다 — 같은 문장을 위아래로 두 번 읽히지 않게.
  const bannerMessage = invalidFields.size === 0 ? errorMessage : null
  const fieldError = (field: RegisterField) => {
    if (!invalidFields.has(field)) return undefined
    // 대표 코드가 가리키는 필드는 그 구체적 문구를(아이디 중복 등), 나머지는 형식 문구를 쓴다.
    return field === primaryField ? (errorMessage ?? copy[field]) : copy[field]
  }
  // 초대 링크로 온 신규 회원이 가입 후 홈이 아니라 원래 가려던 방으로 가게 이어 준다.
  const redirectTo = next && next.startsWith('/') && !next.startsWith('//') ? next : '/'

  return (
    <PageShell width="narrow" center>
      <header className="mb-5 text-center">
        <h1 className="font-brush text-4xl font-black">{d.auth.registerTitle}</h1>
      </header>

      {bannerMessage ? (
        <Alert tone="error" className="mb-5">
          {bannerMessage}
        </Alert>
      ) : null}

      {/* 계정이 하나도 없는 인스턴스 — 이 가입이 곧 관리자 프로비저닝이다. */}
      {firstAccount ? (
        <Alert tone="warn" className="mb-5">
          {d.auth.firstAccountNotice}
        </Alert>
      ) : null}

      <Panel>
        <form className="space-y-4" action={registerAndLogin}>
          <input type="hidden" name="next" value={redirectTo} />
          {/* 실패 redirect 가 쿼리로 돌려준 값을 되채운다 — 비밀번호는 절대 보존하지 않는다. */}
          <Field label={d.auth.usernameLabel} required error={fieldError('username')}>
            {(control) => (
              <Input
                {...control}
                name="username"
                defaultValue={username ?? ''}
                placeholder={d.auth.usernameFormatPlaceholder}
                maxLength={20}
                autoFocus={firstInvalid === 'username'}
                autoComplete="username"
                autoCapitalize="off"
              />
            )}
          </Field>
          <Field label={d.auth.passwordLabel} required error={fieldError('password')}>
            {(control) => (
              <PasswordInput
                {...control}
                name="password"
                placeholder={d.auth.passwordFormatPlaceholder}
                minLength={8}
                maxLength={72}
                autoFocus={firstInvalid === 'password'}
                autoComplete="new-password"
              />
            )}
          </Field>
          <Field label={d.auth.passwordConfirmLabel} required error={fieldError('passwordConfirm')}>
            {(control) => (
              <PasswordInput
                {...control}
                name="passwordConfirm"
                minLength={8}
                maxLength={72}
                autoFocus={firstInvalid === 'passwordConfirm'}
                autoComplete="new-password"
              />
            )}
          </Field>
          <Field label={d.auth.nameLabel} required error={fieldError('name')}>
            {(control) => (
              <Input
                {...control}
                name="name"
                defaultValue={name ?? ''}
                placeholder={d.auth.namePublicPlaceholder}
                maxLength={20}
                autoFocus={firstInvalid === 'name'}
              />
            )}
          </Field>
          <Field label={d.auth.phoneLabel} required error={fieldError('phone')}>
            {(control) => (
              <PhoneInput
                {...control}
                placeholder={d.auth.phonePlaceholder}
                autoFocus={firstInvalid === 'phone'}
              />
            )}
          </Field>
          <SubmitButton
            variant="primary"
            size="lg"
            className="w-full"
            pendingLabel={d.auth.registerPending}
          >
            {d.auth.registerSubmit}
          </SubmitButton>
        </form>
      </Panel>

      <p className="mt-5 text-center text-sm text-muted">
        {d.auth.haveAccount}{' '}
        <Link href="/login" className="font-bold text-text underline underline-offset-4">
          {d.auth.loginLink}
        </Link>
      </p>
    </PageShell>
  )
}
