import { describe, expect, it } from 'vitest'
import { guestIdentitySub, isGuestDeviceSecret, normalizeGuestName } from './guest-identity'

const SECRET = 'test-auth-secret'
const TOKEN = '4b7d0b1a-1f2b-4c3d-9e8f-0a1b2c3d4e5f'
const OTHER_TOKEN = 'c0ffee00-1111-2222-3333-444455556666'
const DEVICE_A = 'A'.repeat(43)
const DEVICE_B = 'B'.repeat(43)

function sub(overrides: Partial<Parameters<typeof guestIdentitySub>[0]> = {}) {
  return guestIdentitySub({
    tokenId: TOKEN,
    deviceSecret: DEVICE_A,
    name: '철수',
    secret: SECRET,
    ...overrides,
  })
}

describe('guestIdentitySub', () => {
  it('토큰 id를 접두사로 유지해 게스트 네임스페이스를 구분한다', () => {
    expect(sub().startsWith(`guest:${TOKEN}:`)).toBe(true)
  })

  it('같은 (기기, 토큰, 이름)이면 같은 계정으로 이어진다', () => {
    expect(sub()).toBe(sub())
  })

  it('이름만 알고 기기 비밀값이 다르면 같은 sub가 나오지 않는다', () => {
    // 이 항목이 원래 결함이다 — 예전 sub는 `guest:{tokenId}:{name}`이라 토큰을 가진 사람이
    // 남의 이름만 입력하면 그 계정으로 로그인됐다.
    expect(sub({ deviceSecret: DEVICE_B })).not.toBe(sub())
  })

  it('같은 기기라도 이름이 다르면 별도 계정이 된다', () => {
    expect(sub({ name: '영희' })).not.toBe(sub())
  })

  it('같은 기기·같은 이름이라도 토큰이 다르면 별도 계정이 된다', () => {
    expect(sub({ tokenId: OTHER_TOKEN })).not.toBe(sub())
  })

  it('AUTH_SECRET이 다르면 같은 입력이라도 다른 sub가 된다', () => {
    expect(sub({ secret: 'rotated-secret' })).not.toBe(sub())
  })

  it('대소문자·앞뒤 공백만 다른 이름은 같은 계정으로 본다', () => {
    expect(sub({ name: '  Chulsoo ' })).toBe(sub({ name: 'chulsoo' }))
  })

  it('이름과 기기 비밀값을 sub에 그대로 싣지 않는다', () => {
    const value = sub({ name: 'chulsoo' })
    expect(value).not.toContain('chulsoo')
    expect(value).not.toContain(DEVICE_A)
  })

  it('공백이 든 이름의 경계가 다른 필드로 새지 않는다', () => {
    // 구분자가 없거나 눈에 보이는 문자면 ('철 수', '철'+'수') 같은 조합이 같은 입력으로
    // 뭉갤 수 있다.
    expect(sub({ name: '철 수' })).not.toBe(sub({ name: '철수' }))
  })
})

describe('normalizeGuestName', () => {
  it('앞뒤 공백을 없애고 소문자로 맞춘다', () => {
    expect(normalizeGuestName('  Chulsoo  ')).toBe('chulsoo')
  })
})

describe('isGuestDeviceSecret', () => {
  it('randomBytes(32)의 base64url 형태만 받는다', () => {
    expect(isGuestDeviceSecret(DEVICE_A)).toBe(true)
    expect(isGuestDeviceSecret('_-Aa09'.padEnd(43, 'x'))).toBe(true)
  })

  it('길이가 다르거나 base64url 밖의 문자가 있으면 거부한다', () => {
    expect(isGuestDeviceSecret('')).toBe(false)
    expect(isGuestDeviceSecret('A'.repeat(42))).toBe(false)
    expect(isGuestDeviceSecret('A'.repeat(44))).toBe(false)
    expect(isGuestDeviceSecret(`${'A'.repeat(42)}=`)).toBe(false)
    expect(isGuestDeviceSecret(`${'A'.repeat(42)}+`)).toBe(false)
  })
})
