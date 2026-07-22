import type { DefaultSession, NextAuthConfig } from 'next-auth'

/**
 * Auth.js 설정의 edge-safe 공통 부분.
 *
 * middleware 는 이 파일만 import 한다 — `auth.ts` 는 DB(postgres) 를 물고 있어
 * edge 번들에 들어가면 안 된다. JWT 해독에는 AUTH_SECRET 과 세션 설정만 있으면 된다.
 */

declare module 'next-auth' {
  interface Session {
    user: { id: string } & DefaultSession['user']
  }
}

export const authConfigBase = {
  providers: [],
  // MT 같은 1~3일 이벤트 도중 재로그인이 뜨지 않도록 세션을 길게 잡는다.
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 3 },
  pages: { signIn: '/login' },
  callbacks: {
    session({ session, token }) {
      if (typeof token.uid === 'string') {
        session.user.id = token.uid
      }
      return session
    },
  },
} satisfies NextAuthConfig
