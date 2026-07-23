import Link from 'next/link'
import { registerAndLogin } from '@/features/auth/actions'
import { Field, Input, Panel, SubmitButton } from '@/components/ui'
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

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; username?: string; name?: string; phone?: string }>
}) {
  const [{ error, username, name, phone }, { d }] = await Promise.all([searchParams, getDict()])
  const errorMessage = error ? (registerErrorCopy(d)[error] ?? d.auth.errorRequestFailed) : null

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-5 px-6 py-10">
      <header className="text-center">
        <h1 className="font-brush text-4xl font-black">{d.auth.registerTitle}</h1>
        <p className="mt-2 text-sm text-muted">{d.auth.registerIntro}</p>
      </header>

      {errorMessage ? (
        <p className="rounded-xl border border-accent/30 bg-[#471a17] px-4 py-3 text-sm font-medium text-[#ff9a94]">
          {errorMessage}
        </p>
      ) : null}

      <Panel>
        <form className="space-y-4" action={registerAndLogin}>
          {/* 실패 redirect 가 쿼리로 돌려준 값을 되채운다 — 비밀번호는 절대 보존하지 않는다. */}
          <Field label={d.auth.usernameLabel}>
            <Input
              name="username"
              defaultValue={username ?? ''}
              placeholder={d.auth.usernameFormatPlaceholder}
              maxLength={20}
              required
              autoComplete="username"
              autoCapitalize="off"
            />
          </Field>
          <Field label={d.auth.passwordLabel}>
            <Input
              name="password"
              type="password"
              placeholder={d.auth.passwordFormatPlaceholder}
              minLength={8}
              maxLength={72}
              required
              autoComplete="new-password"
            />
          </Field>
          <Field label={d.auth.passwordConfirmLabel}>
            <Input
              name="passwordConfirm"
              type="password"
              minLength={8}
              maxLength={72}
              required
              autoComplete="new-password"
            />
          </Field>
          <Field label={d.auth.nameLabel}>
            <Input
              name="name"
              defaultValue={name ?? ''}
              placeholder={d.auth.namePublicPlaceholder}
              maxLength={20}
              required
            />
          </Field>
          <Field label={d.auth.phoneLabel}>
            <Input
              name="phone"
              type="tel"
              defaultValue={phone ?? ''}
              placeholder={d.auth.phonePlaceholder}
              maxLength={13}
              required
              autoComplete="tel"
              inputMode="numeric"
            />
          </Field>
          <SubmitButton variant="primary" size="lg" className="w-full" pendingLabel={d.auth.registerPending}>
            {d.auth.registerSubmit}
          </SubmitButton>
        </form>
      </Panel>

      <p className="text-center text-sm text-muted">
        {d.auth.haveAccount}{' '}
        <Link href="/login" className="font-bold text-text underline underline-offset-4">
          {d.auth.loginLink}
        </Link>
      </p>
    </main>
  )
}
