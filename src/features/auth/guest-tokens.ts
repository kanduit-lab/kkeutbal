import 'server-only'

import { createHmac } from 'node:crypto'
import { eq, isNotNull } from 'drizzle-orm'
import { serverEnv } from '@/lib/env'

export function guestTokenHash(code: string, secret: string): string {
  return createHmac('sha256', secret).update(code).digest('base64url')
}

export async function migrateLegacyGuestTokenSecrets(): Promise<void> {
  const secret = serverEnv().AUTH_SECRET
  const { db, schema } = await import('@/lib/db')
  await db.transaction(async (tx) => {
    const legacyTokens = await tx
      .select({ id: schema.guestTokens.id, code: schema.guestTokens.code })
      .from(schema.guestTokens)
      .where(isNotNull(schema.guestTokens.code))
      .for('update')

    for (const token of legacyTokens) {
      if (!token.code) continue
      await tx
        .update(schema.guestTokens)
        .set({ code: null, codeHash: guestTokenHash(token.code, secret) })
        .where(eq(schema.guestTokens.id, token.id))
    }
  })
}