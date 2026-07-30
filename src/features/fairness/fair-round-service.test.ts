import { describe, expect, it, vi } from 'vitest'

// 이 모듈은 서버 전용 의존성(`server-only`, env, db 커넥션)을 타고 들어간다. seed-crypto.test.ts와
// 같은 방식으로 끊어낸다 — 아래 테스트는 커넥션을 열지 않고 순수 파싱만 본다.
vi.mock('server-only', () => ({}))
vi.mock('@/lib/env', () => ({
  serverEnv: () => ({ AUTH_SECRET: 'fair-round-service-unit-test-secret' }),
}))

import { fairDatabaseNow } from './fair-round-service'
import type { Tx } from '../game/action-helpers'

/**
 * `fairDatabaseNow`가 실제로 받는 값의 모양을 고정한다.
 *
 * 왜 필요한가: drizzle의 raw `execute`는 컬럼 타입 정보가 없어 postgres-js가 값을 파싱하지 않고
 * 문자열 그대로 돌려준다. 원래 코드는 `instanceof Date`만 통과시켰기 때문에 **항상** 던졌고,
 * 검증 딜 방은 판 시작이 통째로 실패했다. 타입·lint·단위 테스트 어느 것도 이걸 잡지 못했다 —
 * 런타임 값의 모양은 타입 선언(`sql<{ now: Date }>`)이 보장해 주지 않는다.
 *
 * DB 왕복 자체는 e2e(`e2e/authenticated-room.spec.ts`의 검증 딜 테스트)가 확인한다. 여기서는
 * 드라이버가 무엇을 주든 시각으로 해석되는지, 못 읽으면 조용히 넘기지 않고 던지는지를 본다.
 */
function txReturning(rows: unknown): Tx {
  return { execute: async () => rows } as unknown as Tx
}

describe('fairDatabaseNow', () => {
  it('파싱하지 않은 드라이버 문자열을 시각으로 읽는다', async () => {
    const now = await fairDatabaseNow(txReturning([{ now: '2026-07-30T09:25:15.752893Z' }]))
    expect(now.toISOString()).toBe('2026-07-30T09:25:15.752Z')
  })

  it('드라이버가 Date를 주면 그대로 쓴다', async () => {
    const value = new Date('2026-07-30T09:25:15.000Z')
    const now = await fairDatabaseNow(txReturning([{ now: value }]))
    expect(now.getTime()).toBe(value.getTime())
  })

  it('행이 없으면 던진다 — 시각 없이 상태를 전이하지 않는다', async () => {
    await expect(fairDatabaseNow(txReturning([]))).rejects.toThrow(/Database clock is unavailable/)
  })

  it('시각으로 해석할 수 없는 값이면 던진다', async () => {
    await expect(fairDatabaseNow(txReturning([{ now: 'not-a-timestamp' }]))).rejects.toThrow(
      /Database clock is unavailable/,
    )
    await expect(fairDatabaseNow(txReturning([{ now: null }]))).rejects.toThrow(
      /Database clock is unavailable/,
    )
  })
})
