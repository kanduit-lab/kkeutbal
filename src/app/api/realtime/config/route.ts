import { NextResponse } from 'next/server'
import { serverEnv } from '@/lib/env'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export function GET(): NextResponse {
  const env = serverEnv()
  const body =
    env.REALTIME_MODE === 'supabase'
      ? {
          mode: 'supabase' as const,
          supabase: {
            url: env.SUPABASE_URL,
            publishableKey: env.SUPABASE_PUBLISHABLE_KEY,
          },
        }
      : { mode: 'self' as const }

  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } })
}
