import 'server-only'

import { randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { serverEnv } from '@/lib/env'
import { isGuestDeviceSecret } from './guest-identity'

/**
 * 게스트 신원을 "이 기기"에 묶는 비밀값 쿠키.
 *
 * 게스트 토큰은 현장에서 여럿이 공유하는 것이 정상 사용 방식이라 토큰 자체로는 사람을 가를 수
 * 없다. 그래서 기기마다 한 번 발급한 256비트 난수를 게스트 sub 계산에 섞는다
 * (`guest-identity.ts`). 이 값은 서버 밖으로 나가지 않고 DB에도 남지 않는다 — 쿠키를 잃으면
 * 그 신원으로 다시 들어올 수 없고, 대신 같은 이름으로도 남의 계정을 가져갈 수 없다.
 *
 * 세션 쿠키(3일)보다 훨씬 길게 잡는다. 게스트가 MT 중간에 로그아웃하거나 세션이 만료돼도
 * 같은 폰·같은 이름이면 원래 좌석으로 돌아와야 하기 때문이다.
 */

const GUEST_DEVICE_COOKIE = 'kkeutbal_guest_device'
const GUEST_DEVICE_MAX_AGE = 60 * 60 * 24 * 180

/**
 * 쿠키에 있으면 그대로 쓰고 없으면 새로 발급한다. 호출할 때마다 만료를 연장한다.
 *
 * 쿠키 쓰기가 가능한 컨텍스트(Server Action·Route Handler)에서만 부를 것. 게스트 로그인
 * Server Action이 `signIn` 전에 한 번 불러 확정한 값을 provider로 넘긴다 — provider의
 * `authorize`는 요청 헤더만 받으므로 방금 발급한 쿠키를 스스로 읽을 수 없다.
 */
export async function issueGuestDeviceSecret(): Promise<string> {
  const store = await cookies()
  const existing = store.get(GUEST_DEVICE_COOKIE)?.value
  const secret =
    existing && isGuestDeviceSecret(existing) ? existing : randomBytes(32).toString('base64url')

  store.set(GUEST_DEVICE_COOKIE, secret, {
    httpOnly: true,
    sameSite: 'lax',
    secure: serverEnv().NODE_ENV === 'production',
    maxAge: GUEST_DEVICE_MAX_AGE,
    path: '/',
  })
  return secret
}
