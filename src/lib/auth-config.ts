import type { DefaultSession, NextAuthConfig } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: { id: string } & DefaultSession['user']
  }
}

export const authConfigBase = {
  providers: [],
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