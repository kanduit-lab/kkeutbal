import { sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { withTimeout } from '@/lib/with-timeout'

export const dynamic = 'force-dynamic'

const READY_TIMEOUT_MS = 2_000

export async function GET(): Promise<NextResponse> {
  try {
    const { db } = await import('@/lib/db')
    await withTimeout(db.execute(sql`select 1`), READY_TIMEOUT_MS, 'readiness probe')
    return NextResponse.json({ status: 'ok', database: 'ok' })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    console.error('readiness probe failed:', reason)

    return NextResponse.json({ status: 'degraded', database: 'unreachable' }, { status: 503 })
  }
}