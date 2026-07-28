import 'server-only'

import { and, eq, gt, isNull, or, sql } from 'drizzle-orm'
import type * as schema from '../../../drizzle/schema'
import { getOptionalDatabase } from '@/lib/optional-database'
import { PUBLIC_READ_TIMEOUT_MS, withTimeout } from '@/lib/with-timeout'
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

export async function isFirstAccount(): Promise<boolean> {
  try {
    const database = await getOptionalDatabase()
    if (!database) return false
    const { db, schema } = database
    const [row] = await withTimeout(
      db.select({ id: schema.users.id }).from(schema.users).limit(1),
      PUBLIC_READ_TIMEOUT_MS,
      'isFirstAccount',
    )
    return !row
  } catch (error) {
    console.error('isFirstAccount failed:', error)
    return false
  }
}

export async function createUserGrantingFirstAdmin(
  values: typeof schema.users.$inferInsert,
  options: {
    requireRegistrationAccess?: boolean
    registrationCodeId?: string | null

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
      throw new Error('registration access is required')
    }
    const [created] = await tx
      .insert(schema.users)
      .values({ ...values, isAdmin: !existing })
      .returning({ id: schema.users.id })
    if (!created) throw new Error('user insert failed')
    if (!existing) {
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