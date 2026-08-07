import type { AuthError } from 'next-auth'
import { ACCOUNT_INACTIVE_CODE, RATE_LIMITED_CODE } from '@/lib/auth'

/**
 * `signIn()` 호출 뒤 리다이렉트 흐름에서만 쓰는 자잘한 안전장치.
 * 등록·로그인 서버 액션(`actions.ts`)이 공유한다.
 */

/** `next` 쿼리 파라미터는 사용자 입력이라, 외부 도메인이나 프로토콜 상대 경로로 못 새게 막는다. */
export function safeInternalPath(value: string): string {
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/'
  try {
    const parsed = new URL(value, 'https://kkeutbal.invalid')
    if (parsed.origin !== 'https://kkeutbal.invalid') return '/'
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return '/'
  }
}

/** provider가 던진 코드는 `error.code`나 `error.cause.err.code` 어느 쪽에도 실려 온다. */
function hasCode(error: AuthError, code: string): boolean {
  if ('code' in error && error.code === code) return true
  const cause = (error as { cause?: { err?: unknown } }).cause?.err
  return Boolean(cause && typeof cause === 'object' && 'code' in cause && cause.code === code)
}

export function isRateLimited(error: AuthError): boolean {
  return hasCode(error, RATE_LIMITED_CODE)
}

export function isAccountInactive(error: AuthError): boolean {
  return hasCode(error, ACCOUNT_INACTIVE_CODE)
}
