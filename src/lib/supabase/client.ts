'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clientEnv } from '../env'

/**
 * 브라우저용 Supabase 클라이언트 — Realtime(Broadcast·Presence) 전용.
 *
 * anon 키 + 공개 채널을 쓴다. 채널 토픽은 UUID 방 id 라 추측이 어렵고,
 * 브로드캐스트 payload 에는 화면 갱신 힌트만 담는다 — 진실은 항상 서버 스냅샷이다.
 * DB 조회는 이 클라이언트로 하지 않는다.
 */

let cached: SupabaseClient | null = null

export function getSupabaseBrowser(): SupabaseClient {
  if (cached) return cached
  const env = clientEnv()
  cached = createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cached
}
