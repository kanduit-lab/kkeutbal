import NextAuth from 'next-auth'
import { authConfigBase } from './lib/auth-config'

/**
 * 인증 게이트. JWT 쿠키 해독만 하므로 edge-safe 설정(authConfigBase)만 쓴다.
 * 실제 권한 검사는 각 Server Action 이 다시 한다 — 여기는 UX 게이트일 뿐이다.
 *
 * 미인증 사용자를 "공개 경로가 아닌 모든 URL"에서 돌려보내면, 새 공개 문서나 존재하지
 * 않는 URL까지 로그인으로 바뀐다. 실제 인증 페이지 접두사만 여기서 보호하고, 나머지는
 * App Router가 공개 페이지 또는 404로 정상 해석하게 둔다.
 */
const { auth } = NextAuth(authConfigBase)

function isPathOrDescendant(pathname: string, basePath: string): boolean {
  return pathname === basePath || pathname.startsWith(`${basePath}/`)
}

function requiresAuthentication(pathname: string): boolean {
  return (
    pathname === '/' ||
    isPathOrDescendant(pathname, '/rooms') ||
    isPathOrDescendant(pathname, '/ranking') ||
    isPathOrDescendant(pathname, '/advisor') ||
    isPathOrDescendant(pathname, '/admin')
  )
}

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl

  if (!req.auth && requiresAuthentication(pathname)) {
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
