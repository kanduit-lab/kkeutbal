import 'server-only'

import { createHmac } from 'node:crypto'
import { eq, isNotNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { serverEnv } from '@/lib/env'

/** 게스트 토큰 원문을 저장하지 않기 위한 AUTH_SECRET 기반 안정 해시. */
export function guestTokenHash(code: string, secret: string): string {
  return createHmac('sha256', secret).update(code).digest('base64url')
}

/**
 * 0011 이전에 원문으로 저장된 토큰을 HMAC으로 교체한다.
 * 관리자 콘솔 진입 시 한 번 실행하며, 토큰별 행 잠금으로 로그인·회수와 충돌하지 않는다.
 */
export async function migrateLegacyGuestTokenSecrets(): Promise<void> {
  const secret = serverEnv().AUTH_SECRET
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
