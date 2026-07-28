import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * 생존 점검만 한다 — 프로세스가 요청을 받아 응답할 수 있는지.
 * 의존성 상태는 보지 않으므로 **배포 검증·헬스체크는 `/api/ready` 를 봐야 한다.**
 * 이 경로만 보면 DB 가 막혀 전 페이지가 죽어도 정상으로 읽힌다.
 */
export function GET(): NextResponse {
  return NextResponse.json({ status: 'ok' })
}
