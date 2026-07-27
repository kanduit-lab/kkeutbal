'use server'

import bcrypt from 'bcryptjs'
import type { Route } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { AuthError } from 'next-auth'
import { and, eq, isNull, like, or } from 'drizzle-orm'
import { z } from 'zod'
import { signIn } from '@/lib/auth'
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

/**
 * 내부 계정 회원가입·로그인 form action.
 * 실패는 redirect 쿼리로 해당 페이지에 돌려준다 — 페이지는 서버 컴포넌트로 유지한다.
 * ?error= 에는 원문 대신 안정된 코드만 싣는다 — 페이지가 화이트리스트로 한국어 문구에
 * 매핑하므로 쿼리로 주입된 임의 텍스트가 그대로 렌더되는 일이 없다.
 */

/** 로그인·회원가입 페이지가 문구로 매핑하는 에러 코드. */
export type AuthErrorCode =
  | 'invalid_credentials'
  | 'guest_token_invalid'
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

const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,20}$/),
  password: z.string().min(8).max(72),
  name: z.string().trim().min(1).max(20),
  phone: z
    .string()
    .transform((value) => value.replace(/\D/g, ''))
    .pipe(z.string().regex(/^01[016789]\d{7,8}$/)),
})

/** 실패 시 되돌려줄 입력값 — 비밀번호는 절대 포함하지 않는다. */
interface RegisterFields {
  username: string
  name: string
}

/**
 * 실패를 폼 화면으로 되돌린다. `next` 는 반드시 함께 실어야 한다 — 비밀번호 오타는
 * 흔한 실패라, 여기서 목적지를 잃으면 재로그인 성공 후 홈으로 떨어지는 게 기본 경험이 된다.
 * 게스트 경로(loginWithGuestToken)는 이미 next 를 보존하고 있었다.
 */
function backTo(
  path: '/register' | '/login',
  code: AuthErrorCode,
  fields?: RegisterFields,
  next?: string,
  invalid?: readonly RegisterFieldName[],
): never {
  const params = new URLSearchParams({ error: code })
  if (fields) {
    // 폼이 지워지지 않게 비민감 필드만 쿼리로 보존한다. 길이는 폼 maxLength 에 맞춰 자른다.
    // 전화번호·비밀번호는 절대 쿼리에 싣지 않는다 (docs/07-auth-and-security.md).
    params.set('username', fields.username.slice(0, 20))
    params.set('name', fields.name.slice(0, 20))
  }
  // 잘못된 필드 전부를 실어 한 번의 왕복으로 모두 표시한다 — 예전에는 첫 이슈만 돌려줘서
  // 아이디와 전화번호가 같이 틀리면 왕복이 두 번 필요했다. 필드명은 고정 화이트리스트다.
  if (invalid && invalid.length > 0) params.set('invalid', invalid.join(','))
  // '/' 는 기본값이라 실을 이유가 없다 — 쿼리를 짧게 유지한다.
  if (next && next !== '/') params.set('next', next)
  redirect(`${path}?${params.toString()}` as Route)
}

/** `?invalid=` 에 실리는 필드 이름 — 페이지가 이 목록으로만 해석한다. */
export type RegisterFieldName = 'username' | 'password' | 'passwordConfirm' | 'name' | 'phone'

const REGISTER_FIELD_NAMES: readonly RegisterFieldName[] = [
  'username',
  'password',
  'passwordConfirm',
  'name',
  'phone',
]

/** zod 이슈 전부에서 필드명을 뽑는다. 알 수 없는 경로는 버린다. */
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

/** zod 첫 이슈의 필드명을 필드별 에러 코드로 바꾼다 — 페이지가 구체적 문구를 보여줄 수 있게. */
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
  // 초대 링크로 온 신규 회원이 가입을 마치고 방이 아니라 홈에 떨어지지 않게 목적지를 이어받는다.
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
    // 계정 생성은 이미 커밋됐다. 쿠키 정리 실패를 가입 실패로 오인시키지 않는다.
    console.error('registration access cookie cleanup failed:', error)
  }
  await signIn('password', { username, password, redirectTo: next })
}

/** 서버 콘솔의 초기 설정 코드를 확인하고 첫 관리자 가입용 10분 증표를 발급한다. */
export async function verifyInitialAdminSetupCode(
  _previousState: InitialAdminSetupState,
  formData: FormData,
): Promise<InitialAdminSetupState> {
  if (!(await isFirstAccount())) return { status: 'error', error: 'unavailable' }

  // 코드가 만료됐다면 이 호출에서 새 코드를 발급해 콘솔에 다시 출력한다.
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

/** 가입코드 검증 성공 시에만 `/register` 접근용 서명 쿠키를 발급한다. */
export async function verifyRegistrationCode(
  _previousState: RegistrationCodeState,
  formData: FormData,
): Promise<RegistrationCodeState> {
  const code = String(formData.get('code') ?? '')
  const address = clientAddressFromHeaders(new Headers(await headers()))
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

  const result = await grantRegistrationAccess(code)
  if (result === 'granted') return { status: 'success' }
  return { status: 'error', error: result }
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
      backTo('/login', 'invalid_credentials', undefined, redirectTo)
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
        error: 'guest_token_invalid',
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

/** guest-token provider(src/lib/auth.ts)와 동일한 코드 형식 — 혼동 문자 제외 8자. */
const guestNamesCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z2-9]{8}$/)

/** 이름 피커 결과 — 실패는 로그인 플로우와 같은 일반 코드만 노출한다. */
export type GuestNamesResult =
  | { ok: true; names: readonly string[] }
  | { ok: false; error: 'guest_token_invalid'; names: readonly string[] }

const GUEST_NAMES_INVALID: GuestNamesResult = {
  ok: false,
  error: 'guest_token_invalid',
  names: [],
}

/**
 * 게스트 토큰으로 이미 입장한 이름 목록. sub 가 `guest:{tokenId}:{name}` 이라
 * 이름 오타가 계정을 조용히 갈라놓는다 — 기존 이름을 탭해 그대로 재사용하게 한다.
 * 토큰 검증(존재·미회수·미만료)은 guest-token provider 와 동일 규칙.
 * 유효하지 않으면 로그인과 같은 일반 코드로만 실패한다 — 세부 사유는 노출하지 않는다.
 */
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

    // token.id 는 DB 가 생성한 uuid — LIKE 와일드카드 문자가 섞일 수 없다.
    const rows = await db
      .select({ name: schema.users.displayName })
      .from(schema.users)
      .where(like(schema.users.authentikSub, `guest:${token.id}:%`))
      .orderBy(schema.users.displayName)
      .limit(20)
    return { ok: true, names: rows.map((row) => row.name) }
  } catch (error) {
    console.error('getGuestNamesForToken failed:', error)
    // DB 오류도 토큰 유효성과 구분해 노출하지 않는다 — 같은 일반 실패로 응답.
    return GUEST_NAMES_INVALID
  }
}
