import 'server-only'

import { db, schema } from '@/lib/db'

/**
 * 첫 실행 프로비저닝 판정.
 *
 * 계정이 하나도 없으면 그 다음 가입자가 곧 운영자다 — 관리자 지정을 위해
 * `AUTH_ADMIN_USERNAMES` 를 넣고 컨테이너를 다시 띄우는 과정을 없애기 위한 경로다.
 * 실제 승격은 `registerAndLogin` 이 같은 트랜잭션 안에서 다시 확인하고 수행한다 —
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
