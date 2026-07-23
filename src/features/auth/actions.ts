'use server'

import bcrypt from 'bcryptjs'
import type { Route } from 'next'
import { redirect } from 'next/navigation'
import { AuthError } from 'next-auth'
import { and, eq, isNull, like, or } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'
import { signIn } from '@/lib/auth'
import { grantRegistrationAccess, hasRegistrationAccess } from '@/features/auth/registration-access'
import { createUserGrantingFirstAdmin } from '@/features/auth/bootstrap'

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

export type RegistrationCodeState =
  | { status: 'idle' }
  | { status: 'error'; error: 'invalid' | 'unavailable' }
  | { status: 'success' }

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
  phone: string
}

function backTo(
  path: '/register' | '/login',
  code: AuthErrorCode,
  fields?: RegisterFields,
): never {
  const params = new URLSearchParams({ error: code })
  if (fields) {
    // 폼이 지워지지 않게 비민감 필드만 쿼리로 보존한다. 길이는 폼 maxLength 에 맞춰 자른다.
    params.set('username', fields.username.slice(0, 20))
    params.set('name', fields.name.slice(0, 20))
    params.set('phone', fields.phone.slice(0, 13))
  }
  redirect(`${path}?${params.toString()}` as Route)
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
  if (!(await hasRegistrationAccess())) {
    backTo('/login', 'registration_code_required')
  }

  const raw = {
    username: String(formData.get('username') ?? ''),
    password: String(formData.get('password') ?? ''),
    name: String(formData.get('name') ?? ''),
    phone: String(formData.get('phone') ?? ''),
  }
  const passwordConfirm = String(formData.get('passwordConfirm') ?? '')
  const rawFields: RegisterFields = { username: raw.username, name: raw.name, phone: raw.phone }

  const parsed = registerSchema.safeParse(raw)
  if (!parsed.success) {
    backTo('/register', validationCode(parsed.error.issues[0]?.path[0]), rawFields)
  }
  if (parsed.data.password !== passwordConfirm) {
    backTo('/register', 'password_mismatch', rawFields)
  }

  const { username, password, name, phone } = parsed.data
  const fields: RegisterFields = { username, name, phone }

  const [taken] = await db
    .select({ username: schema.users.username, phone: schema.users.phone })
    .from(schema.users)
    .where(or(eq(schema.users.username, username), eq(schema.users.phone, phone)))
    .limit(1)
  if (taken) {
    backTo('/register', taken.username === username ? 'username_taken' : 'phone_taken', fields)
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10)
    await createUserGrantingFirstAdmin({
      authentikSub: `local:${username}`,
      username,
      passwordHash,
      phone,
      displayName: name,
    })
  } catch (error) {
    console.error('registerAndLogin failed:', error)
    backTo('/register', 'register_failed', fields)
  }

  await signIn('password', { username, password, redirectTo: '/' })
}

/** 가입코드 검증 성공 시에만 `/register` 접근용 서명 쿠키를 발급한다. */
export async function verifyRegistrationCode(
  _previousState: RegistrationCodeState,
  formData: FormData,
): Promise<RegistrationCodeState> {
  const result = await grantRegistrationAccess(String(formData.get('code') ?? ''))
  if (result === 'granted') return { status: 'success' }
  return { status: 'error', error: result }
}

export async function loginWithPassword(formData: FormData): Promise<void> {
  const username = String(formData.get('username') ?? '')
  const password = String(formData.get('password') ?? '')
  const next = String(formData.get('next') ?? '/')
  const redirectTo = next.startsWith('/') ? next : '/'

  try {
    await signIn('password', { username, password, redirectTo })
  } catch (error) {
    if (error instanceof AuthError) {
      backTo('/login', 'invalid_credentials')
    }
    throw error
  }
}

export async function loginWithGuestToken(formData: FormData): Promise<void> {
  const code = String(formData.get('code') ?? '')
  const name = String(formData.get('name') ?? '')
  const next = String(formData.get('next') ?? '/')
  const redirectTo = next.startsWith('/') ? next : '/'

  try {
    await signIn('guest-token', { code, name, redirectTo })
  } catch (error) {
    if (error instanceof AuthError) {
      const params = new URLSearchParams({ error: 'guest_token_invalid', mode: 'guest', next: redirectTo })
      redirect(`/login?${params.toString()}` as Route)
    }
    throw error
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
    const [token] = await db
      .select({ id: schema.guestTokens.id, expiresAt: schema.guestTokens.expiresAt })
      .from(schema.guestTokens)
      .where(
        and(eq(schema.guestTokens.code, parsed.data), isNull(schema.guestTokens.revokedAt)),
      )
      .limit(1)
    if (!token) return GUEST_NAMES_INVALID
    if (token.expiresAt && token.expiresAt.getTime() < Date.now()) return GUEST_NAMES_INVALID

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
