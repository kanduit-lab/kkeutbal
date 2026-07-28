import 'server-only'

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { serverEnv } from '@/lib/env'

const SETTINGS_ID = 'default'
export const INITIAL_ADMIN_LOCK_KEY = 'kkeutbal:initial-admin-setup'
const COOKIE_NAME = 'kkeutbal_initial_admin_setup'
const SETUP_MAX_AGE_SECONDS = 10 * 60
const SETUP_MAX_AGE_MS = SETUP_MAX_AGE_SECONDS * 1000
const CIPHER_VERSION = 'v1'
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 16

type InitialAdminDatabase = Awaited<
  ReturnType<typeof import('@/lib/optional-database').getOptionalDatabase>
>

const globalForSetup = globalThis as unknown as {
  kkeutbalAnnouncedInitialAdminSetupId?: string
}

function encryptionKey(): Buffer {
  return createHash('sha256')
    .update(serverEnv().AUTH_SECRET)
    .update('\0kkeutbal:initial-admin-setup')
    .digest()
}

function encryptSetupCode(value: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return [
    CIPHER_VERSION,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.')
}

function decryptSetupCode(value: string): string {
  const [version, ivRaw, tagRaw, ciphertextRaw, ...rest] = value.split('.')
  if (version !== CIPHER_VERSION || !ivRaw || !tagRaw || !ciphertextRaw || rest.length > 0) {
    throw new Error('Invalid initial admin setup ciphertext')
  }
  const iv = Buffer.from(ivRaw, 'base64url')
  const tag = Buffer.from(tagRaw, 'base64url')
  if (iv.length !== 12 || tag.length !== 16) {
    throw new Error('Invalid initial admin setup ciphertext')
  }

  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextRaw, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

function generateSetupCode(): string {
  const bytes = randomBytes(CODE_LENGTH)
  const raw = Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('')
  return raw.match(/.{1,4}/g)?.join('-') ?? raw
}

function setupId(ciphertext: string): string {
  return createHash('sha256').update(ciphertext).digest('base64url')
}

function cookieSignature(value: string): string {
  return createHmac('sha256', serverEnv().AUTH_SECRET)
    .update('initial-admin-setup-cookie\0')
    .update(value)
    .digest('base64url')
}

function matches(expected: string, received: string): boolean {
  const expectedBytes = Buffer.from(expected)
  const receivedBytes = Buffer.from(received)
  return (
    expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes)
  )
}

function normalizeCode(value: string): string {
  return value.replace(/[^A-Z0-9]/gi, '').toUpperCase()
}

interface ActiveSetup {
  readonly ciphertext: string
  readonly expiresAt: Date
}

async function currentActiveSetup(
  database: Exclude<InitialAdminDatabase, null>,
): Promise<ActiveSetup | null> {
  const { db, schema } = database
  const [row] = await db
    .select({
      ciphertext: schema.authSettings.initialAdminSetupCiphertext,
      expiresAt: schema.authSettings.initialAdminSetupExpiresAt,
    })
    .from(schema.authSettings)
    .where(eq(schema.authSettings.id, SETTINGS_ID))
    .limit(1)
  if (!row?.ciphertext || !row.expiresAt || row.expiresAt.getTime() <= Date.now()) return null
  return { ciphertext: row.ciphertext, expiresAt: row.expiresAt }
}

/**
 * 사용자가 한 명도 없을 때만 랜덤 설정 코드를 만들고 서버 콘솔에 출력한다.
 * 암호문을 DB에 보관하므로 서버리스 인스턴스가 바뀌어도 같은 코드를 다시 안내할 수 있다.
 */
export async function prepareInitialAdminSetup(): Promise<boolean> {
  try {
    const { getOptionalDatabase } = await import('@/lib/optional-database')
    const database = await getOptionalDatabase()
    if (!database) return false
    const { db, schema } = database
    const { PUBLIC_READ_TIMEOUT_MS, withTimeout } = await import('@/lib/with-timeout')

    // 로그인 화면 렌더 경로다 — DB 가 멈추면 안내를 포기하고 화면은 띄운다.
    const prepared = await withTimeout(
      db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${INITIAL_ADMIN_LOCK_KEY}, 42))`,
        )
        const [existingUser] = await tx.select({ id: schema.users.id }).from(schema.users).limit(1)
        if (existingUser) return null

        const [settings] = await tx
          .select({
            ciphertext: schema.authSettings.initialAdminSetupCiphertext,
            expiresAt: schema.authSettings.initialAdminSetupExpiresAt,
          })
          .from(schema.authSettings)
          .where(eq(schema.authSettings.id, SETTINGS_ID))
          .limit(1)

        let ciphertext =
          settings?.ciphertext && settings.expiresAt && settings.expiresAt.getTime() > Date.now()
            ? settings.ciphertext
            : null
        let expiresAt = settings?.expiresAt ?? null
        let code: string
        if (ciphertext) {
          try {
            code = decryptSetupCode(ciphertext)
          } catch {
            // AUTH_SECRET 교체 등으로 복호화할 수 없으면 기존 코드를 폐기하고 다시 발급한다.
            ciphertext = null
            code = ''
          }
        } else {
          code = ''
        }

        if (!ciphertext) {
          code = generateSetupCode()
          ciphertext = encryptSetupCode(code)
          expiresAt = new Date(Date.now() + SETUP_MAX_AGE_MS)
          await tx
            .insert(schema.authSettings)
            .values({
              id: SETTINGS_ID,
              initialAdminSetupCiphertext: ciphertext,
              initialAdminSetupExpiresAt: expiresAt,
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: schema.authSettings.id,
              set: {
                initialAdminSetupCiphertext: ciphertext,
                initialAdminSetupExpiresAt: expiresAt,
                updatedAt: new Date(),
              },
            })
        }
        return { code, id: setupId(ciphertext) }
      }),
      PUBLIC_READ_TIMEOUT_MS,
      'prepareInitialAdminSetup',
    )

    if (!prepared) return false
    if (globalForSetup.kkeutbalAnnouncedInitialAdminSetupId !== prepared.id) {
      console.warn(
        [
          '',
          '[끗발] 초기 관리자 설정 코드',
          prepared.code,
          '10분 뒤 만료됩니다. 로그인 화면에서 입력하세요.',
          '',
        ].join('\n'),
      )
      globalForSetup.kkeutbalAnnouncedInitialAdminSetupId = prepared.id
    }
    return true
  } catch (error) {
    console.error('prepareInitialAdminSetup failed:', error)
    return false
  }
}

/** 콘솔에 표시된 코드가 현재 DB의 최초 관리자 설정 코드와 일치하면 10분짜리 증표를 발급한다. */
export async function grantInitialAdminSetupAccess(code: string): Promise<boolean> {
  try {
    const normalizedCode = normalizeCode(code)
    if (normalizedCode.length !== CODE_LENGTH) return false

    const { getOptionalDatabase } = await import('@/lib/optional-database')
    const database = await getOptionalDatabase()
    if (!database) return false
    const setup = await currentActiveSetup(database)
    if (!setup) return false

    const expected = normalizeCode(decryptSetupCode(setup.ciphertext))
    if (!matches(expected, normalizedCode)) return false

    const expiresAt = Math.min(
      Math.floor(setup.expiresAt.getTime() / 1000),
      Math.floor(Date.now() / 1000) + SETUP_MAX_AGE_SECONDS,
    )
    const id = setupId(setup.ciphertext)
    const signedValue = `${expiresAt}.${id}`
    const token = `${signedValue}.${cookieSignature(signedValue)}`
    const store = await cookies()
    store.set(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: serverEnv().NODE_ENV === 'production',
      maxAge: SETUP_MAX_AGE_SECONDS,
      path: '/register',
    })
    return true
  } catch (error) {
    console.error('grantInitialAdminSetupAccess failed:', error)
    return false
  }
}

/** 현재 브라우저의 설정 증표가 유효하고 아직 폐기되지 않은 DB 코드와 연결되는지 확인한다. */
export async function initialAdminSetupAccessId(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value
  if (!token) return null
  const [expiresAtRaw, receivedId, receivedSignature, ...rest] = token.split('.')
  if (!expiresAtRaw || !receivedId || !receivedSignature || rest.length > 0) return null
  const expiresAt = Number(expiresAtRaw)
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return null
  const signedValue = `${expiresAtRaw}.${receivedId}`
  if (!matches(cookieSignature(signedValue), receivedSignature)) return null

  try {
    const { getOptionalDatabase } = await import('@/lib/optional-database')
    const database = await getOptionalDatabase()
    if (!database) return null
    const setup = await currentActiveSetup(database)
    if (!setup || !matches(setupId(setup.ciphertext), receivedId)) return null
    return receivedId
  } catch (error) {
    console.error('initialAdminSetupAccessId failed:', error)
    return null
  }
}

export async function consumeInitialAdminSetupAccess(): Promise<void> {
  const store = await cookies()
  store.set(COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'strict',
    secure: serverEnv().NODE_ENV === 'production',
    maxAge: 0,
    path: '/register',
  })
}

/** 첫 사용자 삽입 트랜잭션이 검증할 현재 코드 식별자. */
export function initialAdminSetupIdFromCiphertext(ciphertext: string): string {
  return setupId(ciphertext)
}

export function matchesInitialAdminSetupId(expected: string, received: string): boolean {
  return matches(expected, received)
}
