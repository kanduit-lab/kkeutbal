import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { serverEnv } from '@/lib/env'

/**
 * 로그인한 사용자가 자기 계정에 Authentik SSO를 연결하는 흐름에서 쓰는 쿠키 두 개.
 *
 * **연결 의도 쿠키** (`kkeutbal_sso_link_intent`): `/account`에서 "연결" 버튼을 누른 시점의
 * 세션 사용자 id를 HMAC 서명해 담는다. Authentik 인가 왕복(우리 서버 → Authentik → 콜백)은
 * 우리 앱 세션과 무관한 별도 요청이라, "이 콜백이 누구의 연결 시도인지"는 이 쿠키로만 알 수
 * 있다. next-auth의 state/PKCE 쿠키와 동일하게 SameSite=Lax로 둬야 한다 — Strict는 IdP가
 * 우리 콜백으로 되돌리는 top-level 리다이렉트(크로스 사이트에서 시작)에는 실리지 않는다.
 * 5분 TTL과 1회용(읽자마자 삭제)으로 탈취·재사용 노출 창을 최소화한다.
 *
 * **연결 결과 쿠키** (`kkeutbal_sso_link_result`): jwt 콜백은 OAuth 콜백 요청을 처리하는
 * Route Handler 실행 안에서 돌기 때문에 쿠키를 쓸 수 있지만, `/account` 페이지는 일반 Server
 * Component 렌더라 Next.js가 쿠키 쓰기를 막는다(`cookies().set`은 Server Action·Route
 * Handler에서만 허용된다). 그래서 "쓰기"는 콜백 쪽에서, "읽기"는 페이지 쪽에서 분리했다 —
 * 페이지는 지우지 않고 읽기만 하며, 대신 TTL을 짧게(30초) 잡아 새로고침으로 계속
 * 재노출되는 것을 막는다.
 */

const LINK_INTENT_COOKIE = 'kkeutbal_sso_link_intent'
const LINK_INTENT_MAX_AGE_SECONDS = 5 * 60

const LINK_RESULT_COOKIE = 'kkeutbal_sso_link_result'
const LINK_RESULT_MAX_AGE_SECONDS = 30

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isProduction(): boolean {
  return serverEnv().NODE_ENV === 'production'
}

function sign(domain: string, value: string): string {
  return createHmac('sha256', serverEnv().AUTH_SECRET)
    .update(domain)
    .update('\0')
    .update(value)
    .digest('base64url')
}

function timingSafeEqualString(expected: string, received: string): boolean {
  const expectedBytes = Buffer.from(expected)
  const receivedBytes = Buffer.from(received)
  return (
    expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes)
  )
}

export async function beginSsoLinkIntent(userId: string): Promise<void> {
  const expiresAt = Math.floor(Date.now() / 1000) + LINK_INTENT_MAX_AGE_SECONDS
  const payload = `${expiresAt}.${userId}`
  const token = `${payload}.${sign('sso-link-intent', payload)}`
  const store = await cookies()
  store.set(LINK_INTENT_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction(),
    maxAge: LINK_INTENT_MAX_AGE_SECONDS,
    path: '/api/auth',
  })
}

/**
 * 1회용 — 값을 읽는 즉시 쿠키를 지운다(성공이든 실패든). 재시도는 반드시 `/account`에서
 * 새로 "연결" 버튼을 눌러 다시 시작해야 한다. jwt 콜백(Route Handler 컨텍스트)에서만 호출한다.
 */
export async function consumeSsoLinkIntent(): Promise<string | null> {
  const store = await cookies()
  const raw = store.get(LINK_INTENT_COOKIE)?.value
  store.set(LINK_INTENT_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction(),
    maxAge: 0,
    path: '/api/auth',
  })
  if (!raw) return null

  const [expiresAtRaw, userId, signature, ...rest] = raw.split('.')
  if (!expiresAtRaw || !userId || !signature || rest.length > 0) return null
  const expiresAt = Number(expiresAtRaw)
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return null
  if (!UUID_RE.test(userId)) return null
  if (!timingSafeEqualString(sign('sso-link-intent', `${expiresAtRaw}.${userId}`), signature)) {
    return null
  }
  return userId
}

export type SsoLinkResult =
  | { status: 'linked' }
  | { status: 'rejected'; reason: 'already_linked_elsewhere' | 'account_already_linked' }

/** jwt 콜백(Route Handler 컨텍스트)에서만 호출 — 일반 렌더에서는 쿠키를 쓸 수 없다. */
export async function setSsoLinkResult(result: SsoLinkResult): Promise<void> {
  const store = await cookies()
  store.set(LINK_RESULT_COOKIE, JSON.stringify(result), {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction(),
    maxAge: LINK_RESULT_MAX_AGE_SECONDS,
    path: '/account',
  })
}

/**
 * 읽기 전용 — 지우지 않는다. `/account` 페이지의 일반 Server Component 렌더 안에서
 * 호출하므로 여기서는 쿠키를 쓸 수 없다(짧은 TTL로 자연 만료에 기댄다).
 */
export async function peekSsoLinkResult(): Promise<SsoLinkResult | null> {
  const store = await cookies()
  const raw = store.get(LINK_RESULT_COOKIE)?.value
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      parsed &&
      typeof parsed === 'object' &&
      'status' in parsed &&
      (parsed.status === 'linked' || parsed.status === 'rejected')
    ) {
      return parsed as SsoLinkResult
    }
    return null
  } catch {
    return null
  }
}
