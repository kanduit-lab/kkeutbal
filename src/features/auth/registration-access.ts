import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { and, eq, gt, isNull, or } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { serverEnv } from '@/lib/env'
import { isFirstAccount } from './bootstrap'
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
async function activeDatabaseCodeId(code: string, secret: string): Promise<string | null> {
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
  return row?.id ?? null
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
    const codeId = await activeDatabaseCodeId(parsed.data, env.AUTH_SECRET)
    if (!codeId) {
      return (await hasActiveDatabaseCode()) ? 'invalid' : 'unavailable'
    }
    const expiresAt = Math.floor(Date.now() / 1000) + REGISTRATION_ACCESS_MAX_AGE
    const signedValue = `${expiresAt}.${codeId}`
    const token = `${signedValue}.${signature(signedValue, env.AUTH_SECRET)}`
    const store = await cookies()
    store.set(REGISTRATION_ACCESS_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      maxAge: REGISTRATION_ACCESS_MAX_AGE,
      path: '/register',
    })
    return 'granted'
  } catch (error) {
    console.error('registration code lookup failed:', error)
    return 'unavailable'
  }
}

/** 회원가입 화면과 가입 액션이 모두 확인하는 접근 권한. */
export async function hasRegistrationAccess(): Promise<boolean> {
  if (await isFirstAccount()) return true

  return Boolean(await registrationAccessCodeId())
}

/** 현재 서명 쿠키가 가리키는 활성 가입코드 id. 첫 계정 비상 경로에는 null 이다. */
export async function registrationAccessCodeId(): Promise<string | null> {
  const env = serverEnv()
  const token = (await cookies()).get(REGISTRATION_ACCESS_COOKIE)?.value
  if (!token) return null
  const [expiresAtRaw, codeId, receivedSignature, ...rest] = token.split('.')
  if (!expiresAtRaw || !codeId || !receivedSignature || rest.length > 0) return null

  const expiresAt = Number(expiresAtRaw)
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return null
  const signedValue = `${expiresAtRaw}.${codeId}`
  if (!matches(signature(signedValue, env.AUTH_SECRET), receivedSignature)) return null

  try {
    const [active] = await db
      .select({ id: schema.registrationCodes.id })
      .from(schema.registrationCodes)
      .where(
        and(
          eq(schema.registrationCodes.id, codeId),
          isNull(schema.registrationCodes.revokedAt),
          or(
            isNull(schema.registrationCodes.expiresAt),
            gt(schema.registrationCodes.expiresAt, new Date()),
          ),
        ),
      )
      .limit(1)
    return active?.id ?? null
  } catch (error) {
    console.error('registration access recheck failed:', error)
    return null
  }
}

/** 가입 성공 후 접근 쿠키를 지워 같은 검증 세션이 재사용되지 않게 한다. */
export async function consumeRegistrationAccess(): Promise<void> {
  const store = await cookies()
  store.set(REGISTRATION_ACCESS_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: serverEnv().NODE_ENV === 'production',
    maxAge: 0,
    path: '/register',
  })
}
