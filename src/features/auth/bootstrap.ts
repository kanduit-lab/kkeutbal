import 'server-only'

import { sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'

/** 첫 관리자 승격 직렬화용 고정 락 키 — 방 단위 락과 네임스페이스가 겹치지 않는다. */
const BOOTSTRAP_LOCK_KEY = 'kkeutbal:bootstrap-admin'

/**
 * 첫 실행 프로비저닝 판정.
 *
 * 계정이 하나도 없으면 그 다음 가입자가 곧 운영자다.
 * 실제 승격은 `createUserGrantingFirstAdmin` 이 같은 트랜잭션 안에서 다시 확인하고 수행한다 —
 * 이 함수는 화면 안내용이라 결과가 조금 낡아도 안전하다.
 */
export async function isFirstAccount(): Promise<boolean> {
  try {
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
 * **비밀번호 가입과 SSO 최초 로그인이 이 함수를 공유해야 한다.** 한쪽에만 승격 로직을 두면,
 * SSO 가 유일한 로그인 수단인 인스턴스는 관리자를 만들 방법이 영영 없어진다.
 */
export async function createUserGrantingFirstAdmin(
  values: typeof schema.users.$inferInsert,
): Promise<{ id: string }> {
  return await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${BOOTSTRAP_LOCK_KEY}, 42))`)
    const [existing] = await tx.select({ id: schema.users.id }).from(schema.users).limit(1)
    const [created] = await tx
      .insert(schema.users)
      .values({ ...values, isAdmin: !existing })
      .returning({ id: schema.users.id })
    if (!created) throw new Error('user insert failed')
    return created
  })
}
