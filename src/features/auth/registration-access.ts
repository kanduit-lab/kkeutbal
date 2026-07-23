import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { and, eq, gt, isNull, or } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { serverEnv } from '@/lib/env'
import { registrationCodeHash, registrationCodeSchema } from './registration-codes'

const REGISTRATION_ACCESS_COOKIE = 'kkeutbal_registration_access'
const REGISTRATION_ACCESS_MAX_AGE = 60 * 10

type RegistrationAccessResult = 'granted' | 'invalid' | 'unavailable'

function signature(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url')
}

function matches(expected: string, received: string): boolean {
  const expectedBytes = Buffer.from(expected)
  const receivedBytes = Buffer.from(received)
  return (
    expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes)
  )
}

/** 가입코드가 맞으면 10분 동안만 유효한, 위조 방지 서명 쿠키를 발급한다. */
async function isActiveDatabaseCode(code: string, secret: string): Promise<boolean> {
  const now = new Date()
  const [row] = await db
    .select({ id: schema.registrationCodes.id })
    .from(schema.registrationCodes)
    .where(
      and(
        eq(schema.registrationCodes.codeHash, registrationCodeHash(code, secret)),
        isNull(schema.registrationCodes.revokedAt),
        or(isNull(schema.registrationCodes.expiresAt), gt(schema.registrationCodes.expiresAt, now)),
      ),
    )
    .limit(1)
  return Boolean(row)
}

async function hasActiveDatabaseCode(): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.registrationCodes.id })
    .from(schema.registrationCodes)
    .where(
      and(
        isNull(schema.registrationCodes.revokedAt),
        or(
          isNull(schema.registrationCodes.expiresAt),
          gt(schema.registrationCodes.expiresAt, new Date()),
        ),
      ),
    )
    .limit(1)
  return Boolean(row)
}

export async function grantRegistrationAccess(code: string): Promise<RegistrationAccessResult> {
  const parsed = registrationCodeSchema.safeParse(code)
  const env = serverEnv()
  if (!parsed.success) return 'invalid'

  try {
    const matchedDatabaseCode = await isActiveDatabaseCode(parsed.data, env.AUTH_SECRET)
    const matchedBootstrapCode =
      env.AUTH_REGISTRATION_CODE !== undefined && matches(env.AUTH_REGISTRATION_CODE, parsed.data)
    if (!matchedDatabaseCode && !matchedBootstrapCode) {
      return (await hasActiveDatabaseCode()) || env.AUTH_REGISTRATION_CODE
        ? 'invalid'
        : 'unavailable'
    }
  } catch (error) {
    console.error('registration code lookup failed:', error)
    return 'unavailable'
  }

  const expiresAt = Math.floor(Date.now() / 1000) + REGISTRATION_ACCESS_MAX_AGE
  const value = String(expiresAt)
  const token = `${value}.${signature(value, env.AUTH_SECRET)}`
  const store = await cookies()
  store.set(REGISTRATION_ACCESS_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    maxAge: REGISTRATION_ACCESS_MAX_AGE,
    path: '/register',
  })
  return 'granted'
}

/** 회원가입 화면과 가입 액션이 모두 확인하는 접근 권한. */
export async function hasRegistrationAccess(): Promise<boolean> {
  const env = serverEnv()
  const token = (await cookies()).get(REGISTRATION_ACCESS_COOKIE)?.value
  if (!token) return false
  const [expiresAtRaw, receivedSignature, ...rest] = token.split('.')
  if (!expiresAtRaw || !receivedSignature || rest.length > 0) return false

  const expiresAt = Number(expiresAtRaw)
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false
  return matches(signature(expiresAtRaw, env.AUTH_SECRET), receivedSignature)
}
