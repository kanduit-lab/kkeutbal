import NextAuth from 'next-auth'
import Authentik from 'next-auth/providers/authentik'

/**
 * Auth.js v5 + Authentik OIDC.
 *
 * 흐름·역할 정의는 docs/07-auth-and-security.md 가 소유한다.
 * 자격 증명은 `AUTH_AUTHENTIK_ID` / `_SECRET` / `_ISSUER` 환경변수에서 자동으로 읽는다 —
 * provider 인자에 값을 직접 넣지 않는다.
 *
 * @todo Phase 2 (docs/09-roadmap.md)
 *   - jwt/session 콜백에서 authentik sub → public.users upsert 후 users.id 를 세션에 주입
 *   - Supabase RLS 용 단명 JWT 발급 경로 연결 (SUPABASE_JWT_SECRET)
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Authentik],
  // MT 같은 1~3일 이벤트 도중 재로그인이 뜨지 않도록 세션을 길게 잡는다.
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 3 },
  pages: { signIn: '/login' },
})
