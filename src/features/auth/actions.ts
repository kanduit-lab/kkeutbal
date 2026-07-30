'use server'

import bcrypt from 'bcryptjs'
import type { Route } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { AuthError } from 'next-auth'
import { and, eq, isNull, like, or } from 'drizzle-orm'
import { z } from 'zod'
import { RATE_LIMITED_CODE, signIn } from '@/lib/auth'
import { clientAddressFromHeaders, consumeRateLimits } from '@/lib/rate-limit'
import {
  consumeRegistrationAccess,
  grantRegistrationAccess,
  hasRegistrationAccess,
  registrationAccessCodeId,
} from '@/features/auth/registration-access'
import {
  createUserGrantingFirstAdmin,
  InitialAdminSetupRequiredError,
  isFirstAccount,
} from '@/features/auth/bootstrap'
import {
  consumeInitialAdminSetupAccess,
  grantInitialAdminSetupAccess,
  initialAdminSetupAccessId,
  prepareInitialAdminSetup,
} from '@/features/auth/initial-admin-setup'
import { guestTokenHash } from '@/features/auth/guest-tokens'
import { serverEnv } from '@/lib/env'

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

export type RegistrationCodeState =
  { status: 'idle' } | { status: 'error'; error: 'invalid' | 'unavailable' } | { status: 'success' }

export type InitialAdminSetupState =
  { status: 'idle' } | { status: 'error'; error: 'invalid' | 'unavailable' } | { status: 'success' }

// 회원가입과 계정 설정(표시 이름 변경)이 같은 제약을 쓰도록 공유한다.
// 여기서 바꾸면 두 경로 모두 즉시 갈라지지 않고 함께 바뀐다.
export const displayNameSchema = z.string().trim().min(1).max(20)

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
        authentikSub: `local:${username}`,
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
  if (!(await isFirstAccount())) return { status: 'error', error: 'unavailable' }

  if (!(await prepareInitialAdminSetup())) return { status: 'error', error: 'unavailable' }

  const code = String(formData.get('code') ?? '')
  const address = clientAddressFromHeaders(new Headers(await headers()))
  const rate = await consumeRateLimits([
    {
      scope: 'auth.initial_admin_setup.address',
      identifier: address,
      limit: 10,
      windowMs: 15 * 60 * 1000,
    },
    {
      scope: 'auth.initial_admin_setup.value_address',
      identifier: `${code}\0${address}`,
      limit: 5,
      windowMs: 15 * 60 * 1000,
    },
  ])
  if (!rate.allowed) return { status: 'error', error: 'invalid' }

  return (await grantInitialAdminSetupAccess(code))
    ? { status: 'success' }
    : { status: 'error', error: 'invalid' }
}

export async function verifyRegistrationCode(
  _previousState: RegistrationCodeState,
  formData: FormData,
): Promise<RegistrationCodeState> {
  const code = String(formData.get('code') ?? '')
  const address = clientAddressFromHeaders(new Headers(await headers()))
  try {
    const rate = await consumeRateLimits([
      {
        scope: 'auth.registration_code.address',
        identifier: address,
        limit: 15,
        windowMs: 15 * 60 * 1000,
      },
      {
        scope: 'auth.registration_code.value_address',
        identifier: `${code}\0${address}`,
        limit: 5,
        windowMs: 15 * 60 * 1000,
      },
    ])
    if (!rate.allowed) return { status: 'error', error: 'invalid' }
  } catch (error) {
    console.error('registration code rate limit check failed:', error)
    return { status: 'error', error: 'unavailable' }
  }

  const result = await grantRegistrationAccess(code)
  if (result === 'granted') return { status: 'success' }
  return { status: 'error', error: result }
}

function isRateLimited(error: AuthError): boolean {
  if ('code' in error && error.code === RATE_LIMITED_CODE) return true
  const cause = (error as { cause?: { err?: unknown } }).cause?.err
  return Boolean(
    cause && typeof cause === 'object' && 'code' in cause && cause.code === RATE_LIMITED_CODE,
  )
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
      backTo(
        '/login',
        isRateLimited(error) ? 'too_many_attempts' : 'invalid_credentials',
        undefined,
        redirectTo,
      )
    }
    throw error
  }
}

export async function loginWithGuestToken(formData: FormData): Promise<void> {
  const code = String(formData.get('code') ?? '')
  const name = String(formData.get('name') ?? '')
  const next = String(formData.get('next') ?? '/')
  const redirectTo = safeInternalPath(next)

  try {
    await signIn('guest-token', { code, name, redirectTo })
  } catch (error) {
    if (error instanceof AuthError) {
      const params = new URLSearchParams({
        error: isRateLimited(error) ? 'too_many_attempts' : 'guest_token_invalid',
        mode: 'guest',
        next: redirectTo,
      })
      redirect(`/login?${params.toString()}` as Route)
    }
    throw error
  }
}

function safeInternalPath(value: string): string {
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/'
  try {
    const parsed = new URL(value, 'https://kkeutbal.invalid')
    if (parsed.origin !== 'https://kkeutbal.invalid') return '/'
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return '/'
  }
}

const guestNamesCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z2-9]{8}$/)

export type GuestNamesResult =
  | { ok: true; names: readonly string[] }
  | { ok: false; error: 'guest_token_invalid'; names: readonly string[] }

const GUEST_NAMES_INVALID: GuestNamesResult = {
  ok: false,
  error: 'guest_token_invalid',
  names: [],
}

export async function getGuestNamesForToken(code: string): Promise<GuestNamesResult> {
  const parsed = guestNamesCodeSchema.safeParse(code)
  if (!parsed.success) return GUEST_NAMES_INVALID

  try {
    const address = clientAddressFromHeaders(new Headers(await headers()))
    const rate = await consumeRateLimits([
      {
        scope: 'auth.guest_names.address',
        identifier: address,
        limit: 30,
        windowMs: 15 * 60 * 1000,
      },
      {
        scope: 'auth.guest_names.token_address',
        identifier: `${parsed.data}\0${address}`,
        limit: 10,
        windowMs: 15 * 60 * 1000,
      },
    ])
    if (!rate.allowed) return GUEST_NAMES_INVALID

    const codeHash = guestTokenHash(parsed.data, serverEnv().AUTH_SECRET)
    const { db, schema } = await import('@/lib/db')
    const [token] = await db
      .select({
        id: schema.guestTokens.id,
        code: schema.guestTokens.code,
        expiresAt: schema.guestTokens.expiresAt,
      })
      .from(schema.guestTokens)
      .where(
        and(
          or(eq(schema.guestTokens.codeHash, codeHash), eq(schema.guestTokens.code, parsed.data)),
          isNull(schema.guestTokens.revokedAt),
        ),
      )
      .limit(1)
    if (!token) return GUEST_NAMES_INVALID
    if (token.expiresAt && token.expiresAt.getTime() < Date.now()) return GUEST_NAMES_INVALID
    if (token.code) {
      await db
        .update(schema.guestTokens)
        .set({ code: null, codeHash })
        .where(eq(schema.guestTokens.id, token.id))
    }

    const rows = await db
      .select({ name: schema.users.displayName })
      .from(schema.users)
      .where(like(schema.users.authentikSub, `guest:${token.id}:%`))
      .orderBy(schema.users.displayName)
      .limit(20)
    return { ok: true, names: rows.map((row) => row.name) }
  } catch (error) {
    console.error('getGuestNamesForToken failed:', error)

    return GUEST_NAMES_INVALID
  }
}