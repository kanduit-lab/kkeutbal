import { createHmac } from 'node:crypto'

/**
 * 게스트 신원 sub를 만드는 순수 함수. 서버에서만 import한다(브라우저 번들에 들어가면 안 된다).
 * `server-only`를 넣지 않은 이유는 단위 테스트에서 그대로 부르기 위해서다 — 이 파일에는 I/O가
 * 없고 쿠키 읽기·쓰기는 `guest-device.ts`가 맡는다.
 *
 * ## 왜 이름만으로 sub를 만들지 않는가
 *
 * 예전 sub는 `guest:{tokenId}:{name.toLowerCase()}`였다. 토큰 하나를 여럿이 나눠 쓰는 것이
 * MT 현장의 정상 사용 방식이라, 토큰을 가진 사람이 남의 이름을 그대로 입력하면 그 사람의
 * 계정으로 로그인됐다. 그 사람이 방장이면 정산·역할 변경·판 종료 권한까지 넘어갔다.
 *
 * 지금 sub는 `(이 기기의 비밀값, 토큰, 이름)` 세 가지의 HMAC이다. 기기 비밀값은 httpOnly
 * 쿠키에만 있고 DB에는 어떤 형태로도 저장하지 않는다 — sub 자체가 검증이라, 비밀값을 모르면
 * 같은 sub를 만들 수 없고 따라서 같은 계정에 들어갈 수 없다.
 *
 * 이름은 여전히 신원의 일부다. 같은 기기에서 같은 토큰·같은 이름으로 다시 들어오면 같은
 * 계정으로 이어지고(로그아웃 뒤 재입장), 같은 기기에서 다른 이름을 쓰면 별도 계정이 된다
 * (폰 하나를 잠깐 빌려주는 경우).
 */

/** `randomBytes(32).toString('base64url')`의 형태 — 43자 base64url. */
export const GUEST_DEVICE_SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/

/**
 * HMAC 입력에서 세 값의 경계를 고정한다. 이름에는 공백이 들어갈 수 있어 눈에 보이는 문자를
 * 구분자로 쓰면 서로 다른 조합이 같은 입력 문자열로 뭉갤 여지가 생긴다. 기기 비밀값·토큰
 * id·이름 어디에도 NUL은 들어갈 수 없다.
 */
const FIELD_SEPARATOR = String.fromCharCode(0)

export function isGuestDeviceSecret(value: string): boolean {
  return GUEST_DEVICE_SECRET_PATTERN.test(value)
}

/** 같은 사람이 대소문자·앞뒤 공백만 다르게 입력해도 같은 계정으로 이어지게 한다. */
export function normalizeGuestName(name: string): string {
  return name.trim().toLowerCase()
}

export function guestIdentitySub(input: {
  tokenId: string
  deviceSecret: string
  name: string
  secret: string
}): string {
  const { tokenId, deviceSecret, name, secret } = input
  const claim = createHmac('sha256', secret)
    .update([deviceSecret, tokenId, normalizeGuestName(name)].join(FIELD_SEPARATOR))
    .digest('base64url')
  return `guest:${tokenId}:${claim}`
}
