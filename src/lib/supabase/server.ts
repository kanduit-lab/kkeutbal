import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { clientEnv, serverEnv } from '../env'

/**
 * 서버 전용 Supabase 클라이언트 (service role).
 *
 * RLS 를 우회하므로 **권한 검사를 반드시 호출부에서 먼저** 한다.
 * 칩 원장 쓰기처럼 클라이언트에 열지 않은 경로가 여기를 통과한다 (docs/02-data-model.md).
 *
 * 클라이언트 컴포넌트에서 import 하지 말 것 — serverEnv() 가 즉시 던진다.
 */
export function createServiceClient() {
  const publicEnv = clientEnv()
  const secret = serverEnv()

  return createSupabaseClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, secret.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
