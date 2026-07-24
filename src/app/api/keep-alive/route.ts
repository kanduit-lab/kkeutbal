import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { serverEnv } from '@/lib/env'

export const dynamic = 'force-dynamic'

function hasValidSecret(expected: string, received: string | null): boolean {
  if (!received) return false
  const expectedBytes = Buffer.from(expected)
  const receivedBytes = Buffer.from(received)
  return (
    expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes)
  )
}

/** GitHub Actions 전용 DB keep-alive. 공개 Supabase REST 쓰기 권한은 사용하지 않는다. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? null
  const { KEEP_ALIVE_SECRET } = serverEnv()
  if (!hasValidSecret(KEEP_ALIVE_SECRET, token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await db.execute(sql`select 1`)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error('keep-alive database ping failed:', error)
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  }
}
