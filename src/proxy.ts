import NextAuth from 'next-auth'
import { authConfigBase } from './lib/auth-config'

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
    isPathOrDescendant(pathname, '/admin') ||
    isPathOrDescendant(pathname, '/wallet') ||
    isPathOrDescendant(pathname, '/account')
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
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|svg|jpg|jpeg|webp|ico|woff2?)).*)',
  ],
}
