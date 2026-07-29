'use client'

import { registerAndLogin } from '@/features/auth/actions'
import { Alert, Field, Input, Panel, SubmitButton } from '@/components/ui'
import { PhoneInput } from '@/features/auth/components/phone-input'
import { PasswordInput } from '@/features/auth/components/password-input'
import { useDict } from '@/lib/i18n/client'

type RegisterField = 'username' | 'password' | 'passwordConfirm' | 'name' | 'phone'

const REGISTER_FIELDS: readonly RegisterField[] = [
  'username',
  'password',
  'passwordConfirm',
  'name',
  'phone',
]

function registerErrorCopy(d: ReturnType<typeof useDict>['d']): Record<string, string> {
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

function fieldCopy(d: ReturnType<typeof useDict>['d']): Record<RegisterField, string> {
  return {
    username: d.auth.errorUsername,
    password: d.auth.errorPassword,
    passwordConfirm: d.auth.errorPasswordMismatch,
    name: d.auth.errorName,
    phone: d.auth.errorPhone,
  }
}

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

function parseInvalid(raw: string | undefined): readonly RegisterField[] {
  if (!raw) return []
  return raw
    .split(',')
    .filter((name): name is RegisterField => (REGISTER_FIELDS as readonly string[]).includes(name))
}

export function RegisterForm({
  error,
  username,
  name,
  invalid,
  redirectTo,
}: {
  error?: string
  username?: string
  name?: string
  invalid?: string
  redirectTo: string
}) {
  const { d } = useDict()
  const errorMessage = error ? (registerErrorCopy(d)[error] ?? d.auth.errorRequestFailed) : null
  const primaryField = errorField(error)

  const invalidFields = new Set<RegisterField>(parseInvalid(invalid))
  if (primaryField) invalidFields.add(primaryField)
  const firstInvalid = REGISTER_FIELDS.find((field) => invalidFields.has(field)) ?? null
  const copy = fieldCopy(d)

  const bannerMessage = invalidFields.size === 0 ? errorMessage : null
  const fieldError = (field: RegisterField) => {
    if (!invalidFields.has(field)) return undefined

    return field === primaryField ? (errorMessage ?? copy[field]) : copy[field]
  }

  return (
    <>
      {bannerMessage ? (
        <Alert tone="error" className="mb-5">
          {bannerMessage}
        </Alert>
      ) : null}

      <Panel>
        <form className="space-y-4" action={registerAndLogin}>
          <input type="hidden" name="next" value={redirectTo} />
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
    </>
  )
}
