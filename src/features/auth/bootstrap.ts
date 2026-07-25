import 'server-only'

import { and, eq, gt, isNull, or, sql } from 'drizzle-orm'
import type * as schema from '../../../drizzle/schema'
import { getOptionalDatabase } from '@/lib/optional-database'
import {
  INITIAL_ADMIN_LOCK_KEY,
  initialAdminSetupIdFromCiphertext,
  matchesInitialAdminSetupId,
} from './initial-admin-setup'

export class InitialAdminSetupRequiredError extends Error {
  constructor() {
    super('initial admin setup access is required')
    this.name = 'InitialAdminSetupRequiredError'
  }
}

/**
 * 첫 실행 프로비저닝 판정.
 *
 * 계정이 하나도 없으면 초기 관리자 설정 가드를 노출한다.
 * 실제 승격은 `createUserGrantingFirstAdmin` 이 같은 트랜잭션 안에서 다시 확인하고 수행한다 —
 * 이 함수는 화면 안내용이라 결과가 조금 낡아도 안전하다.
 */
export async function isFirstAccount(): Promise<boolean> {
  try {
    const database = await getOptionalDatabase()
    if (!database) return false
    const { db, schema } = database
    const [row] = await db.select({ id: schema.users.id }).from(schema.users).limit(1)
    return !row
  } catch (error) {
    // 마이그레이션 전 등 조회 실패는 "첫 계정 아님"으로 취급한다 — 안내를 잘못 띄우지 않는다.
    console.error('isFirstAccount failed:', error)
    return false
  }
}

/**
 * 사용자 행을 만들되, 그 계정이 이 인스턴스의 첫 계정이면 관리자로 승격한다.
 *
 * 판정과 삽입을 한 트랜잭션 + advisory lock 으로 묶는다 — 동시에 두 명이 가입하면
 * 둘 다 "계정 없음"을 보고 관리자가 두 명 생기기 때문이다.
 *
 * 모든 사용자 생성 경로가 이 함수를 공유해야 한다. 그래야 설정 코드를 검증하지 않은 SSO나
 * 직접 호출이 빈 DB의 첫 관리자 자리를 선점하지 못한다.
 */
export async function createUserGrantingFirstAdmin(
  values: typeof schema.users.$inferInsert,
  options: {
    /** 내부 가입은 기존 계정이 있으면 활성 가입코드를 트랜잭션 안에서 다시 확인한다. */
    requireRegistrationAccess?: boolean
    registrationCodeId?: string | null
    /** 콘솔 설정 코드를 검증한 브라우저에 발급된, 현재 코드의 식별자. */
    initialAdminSetupId?: string | null
  } = {},
): Promise<{ id: string }> {
  const { db, schema } = await import('@/lib/db')
  return await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${INITIAL_ADMIN_LOCK_KEY}, 42))`,
    )
    const [existing] = await tx.select({ id: schema.users.id }).from(schema.users).limit(1)
    if (!existing) {
      const [settings] = await tx
        .select({
          ciphertext: schema.authSettings.initialAdminSetupCiphertext,
          expiresAt: schema.authSettings.initialAdminSetupExpiresAt,
        })
        .from(schema.authSettings)
        .where(eq(schema.authSettings.id, 'default'))
        .limit(1)
        .for('update')
      const expectedId =
        settings?.ciphertext && settings.expiresAt && settings.expiresAt.getTime() > Date.now()
          ? initialAdminSetupIdFromCiphertext(settings.ciphertext)
          : null
      if (
        !expectedId ||
        !options.initialAdminSetupId ||
        !matchesInitialAdminSetupId(expectedId, options.initialAdminSetupId)
      ) {
        throw new InitialAdminSetupRequiredError()
      }
    } else if (options.registrationCodeId) {
      const [activeCode] = await tx
        .select({ id: schema.registrationCodes.id })
        .from(schema.registrationCodes)
        .where(
          and(
            eq(schema.registrationCodes.id, options.registrationCodeId),
            isNull(schema.registrationCodes.revokedAt),
            or(
              isNull(schema.registrationCodes.expiresAt),
              gt(schema.registrationCodes.expiresAt, new Date()),
            ),
          ),
        )
        .limit(1)
        .for('update')
      if (!activeCode) throw new Error('registration access is no longer active')
    } else if (options.requireRegistrationAccess) {
      // 첫 계정은 비상 프로비저닝 경로지만, 그 뒤의 내부 가입은 반드시 코드가 필요하다.
      throw new Error('registration access is required')
    }
    const [created] = await tx
      .insert(schema.users)
      .values({ ...values, isAdmin: !existing })
      .returning({ id: schema.users.id })
    if (!created) throw new Error('user insert failed')
    if (!existing) {
      // 같은 트랜잭션에서 폐기해 검증된 다른 브라우저도 코드를 재사용할 수 없게 한다.
      await tx
        .update(schema.authSettings)
        .set({
          initialAdminSetupCiphertext: null,
          initialAdminSetupExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.authSettings.id, 'default'))
    }
    return created
  })
}
