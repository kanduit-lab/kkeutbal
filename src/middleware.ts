import NextAuth from 'next-auth'
import { authConfigBase } from './lib/auth-config'

/**
 * 인증 게이트. JWT 쿠키 해독만 하므로 edge-safe 설정(authConfigBase)만 쓴다.
 * 실제 권한 검사는 각 Server Action 이 다시 한다 — 여기는 UX 게이트일 뿐이다.
 */
const { auth } = NextAuth(authConfigBase)

export default auth((req) => {
  const { pathname } = req.nextUrl
  const isPublic =
    pathname.startsWith('/login') ||
    pathname.startsWith('/register') ||
    pathname.startsWith('/about') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/health')

  if (!req.auth && !isPublic) {
    const url = new URL('/login', req.nextUrl)
    if (pathname !== '/') url.searchParams.set('next', pathname)
    return Response.redirect(url)
  }

  if (req.auth && pathname === '/login') {
    return Response.redirect(new URL('/', req.nextUrl))
  }

  return undefined
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|svg|jpg|jpeg|webp|ico|woff2?)).*)'],
}
