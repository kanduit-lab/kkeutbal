import { createBrowserClient } from '@supabase/ssr'
import { clientEnv } from '../env'

/**
 * 브라우저용 Supabase 클라이언트. Realtime 구독 전용에 가깝다.
 *
 * anon 키만 쓰며, RLS 판정에 필요한 신원은 `accessToken` 으로 넘긴 단명 JWT 가 제공한다
 * (docs/07-auth-and-security.md "Supabase RLS 브리지").
 *
 * @param accessToken 서버가 발급한 Supabase JWT. 만료 전 갱신 책임은 호출부에 있다.
 */
export function createClient(accessToken: () => Promise<string>) {
  const env = clientEnv()

  return createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    accessToken,
  })
}
