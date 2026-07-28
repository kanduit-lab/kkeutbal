import { sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { withTimeout } from '@/lib/with-timeout'

export const dynamic = 'force-dynamic'

/**
 * 준비 상태 점검 — `/api/health`(생존)와 역할이 다르다.
 *
 * health 는 프로세스가 살아 있는지만 본다. 그래서 DB 커넥션이 막혀 모든 페이지가 524 를
 * 내는 동안에도 200 을 돌려줬고, 배포 검증과 오케스트레이터가 14시간 동안 정상으로 봤다.
 * 여기서는 실제로 DB 를 한 번 찔러 보고, 응답이 늦으면 늦은 것도 실패로 본다.
 *
 * 오케스트레이터 헬스체크는 이 경로를 봐야 한다 — 실패 시 컨테이너가 재시작되면
 * 막힌 커넥션이 소켓과 함께 정리된다.
 */
const READY_TIMEOUT_MS = 2_000

export async function GET(): Promise<NextResponse> {
  try {
    const { db } = await import('@/lib/db')
    await withTimeout(db.execute(sql`select 1`), READY_TIMEOUT_MS, 'readiness probe')
    return NextResponse.json({ status: 'ok', database: 'ok' })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    console.error('readiness probe failed:', reason)
    // 503 이어야 오케스트레이터가 트래픽을 빼거나 재시작한다. 200 이면 장애가 숨는다.
    return NextResponse.json({ status: 'degraded', database: 'unreachable' }, { status: 503 })
  }
}
