'use server'

import bcrypt from 'bcryptjs'
import type { Route } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { AuthError } from 'next-auth'
import { eq, or } from 'drizzle-orm'
import { z } from 'zod'
import { signIn } from '@/lib/auth'
import { clientAddressFromHeaders, consumeRateLimits } from '@/lib/rate-limit'
import { displayNameSchema } from './schemas'
import { safeInternalPath, isAccountInactive, isRateLimited } from './signin-redirects'
import { issueGuestDeviceSecret } from './guest-device'
import {
  verifyInitialAdminSetupAccess,
  verifyRegistrationCodeAccess,
} from './registration-code-verification'
import {
  consumeRegistrationAccess,
  hasRegistrationAccess,
  registrationAccessCodeId,
} from '@/features/auth/registration-access'
import {
  createUserGrantingFirstAdmin,
  InitialAdminSetupRequiredError,
  isFirstAccount,
} from '@/features/auth/bootstrap'
import { consumeInitialAdminSetupAccess, initialAdminSetupAccessId } from '@/features/auth/initial-admin-setup'
import { localSubFor } from './account-linkage'

/**
 * 회원가입·로그인 서버 액션 진입점. 실제 검증 로직 일부는 옆 파일로 나갔다 —
 * `verifyRegistrationCode`/`verifyInitialAdminSetupCode`는 `registration-code-verification.ts` —
 * 하지만 이 파일이 그 함수들을 직접 export해야 한다. `'use server'` 파일은 다른 모듈의 값을
 * `export { x } from '...'`로 다시 내보낼 수 없다(모든 export가 클라이언트 호출 엔드포인트로
 * 취급된다 — `schemas.ts` 주석 참고). 그래서 각 함수는 여기서 얇은 wrapper로 다시 선언하고,
 * 실제 동작은 옆 파일에 위임한다.
 *
 * 여기에 있던 `getGuestNamesForToken`은 제거했다. 인증 없이 토큰 하나로 그 토큰의 표시 이름을
 * 최대 20개 돌려주던 액션인데, 게스트 sub가 이름에서 나오던 시절에는 그 목록이 곧 계정 선택
 * 메뉴였다. 지금은 이름만으로 남의 계정에 붙을 수 없어(`guest-identity.ts`) 목록의 쓸모가
 * 사라졌고, 남겨두면 토큰 소지자에게 참석자 명단을 흘리는 일만 남는다.
 */

export type AuthErrorCode =
  | 'invalid_credentials'
  | 'guest_token_invalid'
  | 'too_many_attempts'
  | 'validation'
  | 'validation_username'
  | 'validation_password'
  | 'validation_name'
  | 'validation_phone'
  | 'password_mismatch'
  | 'username_taken'
  | 'phone_taken'
  | 'register_failed'
  | 'registration_code_required'
  | 'initial_admin_setup_required'
  | 'account_inactive'

export type RegistrationCodeState =
  { status: 'idle' } | { status: 'error'; error: 'invalid' | 'unavailable' } | { status: 'success' }

export type InitialAdminSetupState =
  { status: 'idle' } | { status: 'error'; error: 'invalid' | 'unavailable' } | { status: 'success' }

const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,20}$/),
  password: z.string().min(8).max(72),
  name: displayNameSchema,
  phone: z
    .string()
    .transform((value) => value.replace(/\D/g, ''))
    .pipe(z.string().regex(/^01[016789]\d{7,8}$/)),
})

interface RegisterFields {
  username: string
  name: string
}

function backTo(
  path: '/register' | '/login',
  code: AuthErrorCode,
  fields?: RegisterFields,
  next?: string,
  invalid?: readonly RegisterFieldName[],
): never {
  const params = new URLSearchParams({ error: code })
  if (fields) {
    params.set('username', fields.username.slice(0, 20))
    params.set('name', fields.name.slice(0, 20))
  }

  if (invalid && invalid.length > 0) params.set('invalid', invalid.join(','))

  if (next && next !== '/') params.set('next', next)
  redirect(`${path}?${params.toString()}` as Route)
}

export type RegisterFieldName = 'username' | 'password' | 'passwordConfirm' | 'name' | 'phone'

const REGISTER_FIELD_NAMES: readonly RegisterFieldName[] = [
  'username',
  'password',
  'passwordConfirm',
  'name',
  'phone',
]

function invalidFields(issues: readonly z.ZodIssue[]): readonly RegisterFieldName[] {
  const seen = new Set<RegisterFieldName>()
  for (const issue of issues) {
    const name = issue.path[0]
    if (typeof name === 'string' && (REGISTER_FIELD_NAMES as readonly string[]).includes(name)) {
      seen.add(name as RegisterFieldName)
    }
  }
  return [...seen]
}

function validationCode(issuePath: PropertyKey | undefined): AuthErrorCode {
  switch (issuePath) {
    case 'username':
      return 'validation_username'
    case 'password':
      return 'validation_password'
    case 'name':
      return 'validation_name'
    case 'phone':
      return 'validation_phone'
    default:
      return 'validation'
  }
}

export async function registerAndLogin(formData: FormData): Promise<void> {
  const next = safeInternalPath(String(formData.get('next') ?? '/'))
  const [hasAccess, registrationCodeId, initialAdminSetupId, firstAccount] = await Promise.all([
    hasRegistrationAccess(),
    registrationAccessCodeId(),
    initialAdminSetupAccessId(),
    isFirstAccount(),
  ])
  if (!hasAccess) {
    if (firstAccount) {
      redirect('/login?error=initial_admin_setup_required&mode=registration')
    }
    backTo('/login', 'registration_code_required', undefined, next)
  }

  const raw = {
    username: String(formData.get('username') ?? ''),
    password: String(formData.get('password') ?? ''),
    name: String(formData.get('name') ?? ''),
    phone: String(formData.get('phone') ?? ''),
  }
  const passwordConfirm = String(formData.get('passwordConfirm') ?? '')
  const rawFields: RegisterFields = { username: raw.username, name: raw.name }

  const parsed = registerSchema.safeParse(raw)
  if (!parsed.success) {
    backTo(
      '/register',
      validationCode(parsed.error.issues[0]?.path[0]),
      rawFields,
      next,
      invalidFields(parsed.error.issues),
    )
  }
  if (parsed.data.password !== passwordConfirm) {
    backTo('/register', 'password_mismatch', rawFields, next, ['passwordConfirm'])
  }

  const { username, password, name, phone } = parsed.data
  const fields: RegisterFields = { username, name }
  const address = clientAddressFromHeaders(new Headers(await headers()))
  const registrationRate = await consumeRateLimits([
    {
      scope: 'auth.register.address',
      identifier: address,
      limit: 10,
      windowMs: 60 * 60 * 1000,
    },
    {
      scope: 'auth.register.username_address',
      identifier: `${username}\0${address}`,
      limit: 3,
      windowMs: 60 * 60 * 1000,
    },
  ])
  if (!registrationRate.allowed) backTo('/register', 'register_failed', fields, next)

  const { db, schema } = await import('@/lib/db')
  const [taken] = await db
    .select({ username: schema.users.username, phone: schema.users.phone })
    .from(schema.users)
    .where(or(eq(schema.users.username, username), eq(schema.users.phone, phone)))
    .limit(1)
  if (taken) {
    backTo(
      '/register',
      taken.username === username ? 'username_taken' : 'phone_taken',
      fields,
      next,
      [taken.username === username ? 'username' : 'phone'],
    )
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10)
    await createUserGrantingFirstAdmin(
      {
        authentikSub: localSubFor(username),
        username,
        passwordHash,
        phone,
        displayName: name,
      },
      { requireRegistrationAccess: true, registrationCodeId, initialAdminSetupId },
    )
  } catch (error) {
    if (error instanceof InitialAdminSetupRequiredError) {
      redirect('/login?error=initial_admin_setup_required&mode=registration')
    }
    console.error('registerAndLogin failed:', error)
    backTo('/register', 'register_failed', fields, next)
  }

  try {
    await Promise.all([consumeRegistrationAccess(), consumeInitialAdminSetupAccess()])
  } catch (error) {
    console.error('registration access cookie cleanup failed:', error)
  }
  await signIn('password', { username, password, redirectTo: next })
}

export async function verifyInitialAdminSetupCode(
  _previousState: InitialAdminSetupState,
  formData: FormData,
): Promise<InitialAdminSetupState> {
  return verifyInitialAdminSetupAccess(formData)
}

export async function verifyRegistrationCode(
  _previousState: RegistrationCodeState,
  formData: FormData,
): Promise<RegistrationCodeState> {
  return verifyRegistrationCodeAccess(formData)
}

export async function loginWithPassword(formData: FormData): Promise<void> {
  const username = String(formData.get('username') ?? '')
  const password = String(formData.get('password') ?? '')
  const next = String(formData.get('next') ?? '/')
  const redirectTo = safeInternalPath(next)

  try {
    await signIn('password', { username, password, redirectTo })
  } catch (error) {
    if (error instanceof AuthError) {
      backTo('/login', passwordSignInError(error), undefined, redirectTo)
    }
    throw error
  }
}

function passwordSignInError(error: AuthError): AuthErrorCode {
  if (isRateLimited(error)) return 'too_many_attempts'
  if (isAccountInactive(error)) return 'account_inactive'
  return 'invalid_credentials'
}

function guestSignInFailed(
  reason: 'guest_token_invalid' | 'too_many_attempts',
  next: string,
): never {
  const params = new URLSearchParams({ error: reason, mode: 'guest', next })
  redirect(`/login?${params.toString()}` as Route)
}

export async function loginWithGuestToken(formData: FormData): Promise<void> {
  const code = String(formData.get('code') ?? '')
  const name = String(formData.get('name') ?? '')
  const next = String(formData.get('next') ?? '/')
  const redirectTo = safeInternalPath(next)

  // 게스트 신원은 (기기 비밀값, 토큰, 이름)에 묶인다. provider의 `authorize`는 요청 헤더만
  // 받아서 방금 발급한 쿠키를 읽을 수 없으므로, 여기서 확정한 값을 credentials로 넘긴다.
  // 이 값은 서버가 구성하는 내부 요청 본문에만 실리고 브라우저로 나가지 않는다.
  let device: string
  try {
    device = await issueGuestDeviceSecret()
  } catch (error) {
    console.error('guest device secret issue failed:', error)
    guestSignInFailed('guest_token_invalid', redirectTo)
  }

  try {
    await signIn('guest-token', { code, name, device, redirectTo })
  } catch (error) {
    if (error instanceof AuthError) {
      guestSignInFailed(
        isRateLimited(error) ? 'too_many_attempts' : 'guest_token_invalid',
        redirectTo,
      )
    }
    throw error
  }
}
