import { describe, expect, it } from 'vitest'
import { presenceRevealsUnknownMember } from './presence-policy'

describe('presenceRevealsUnknownMember', () => {
  it('접속자 전원이 이미 아는 멤버면 false다 (재접속 흔들림, refetch 불필요)', () => {
    const online = new Set(['u1', 'u2'])
    const known = new Set(['u1', 'u2', 'u3'])
    expect(presenceRevealsUnknownMember(online, known)).toBe(false)
  })

  it('모르는 id가 하나라도 있으면 true다 (새 참가자 입장 가능성)', () => {
    const online = new Set(['u1', 'u9'])
    const known = new Set(['u1', 'u2'])
    expect(presenceRevealsUnknownMember(online, known)).toBe(true)
  })

  it('접속자가 아무도 없으면 false다', () => {
    expect(presenceRevealsUnknownMember(new Set(), new Set(['u1']))).toBe(false)
  })
})
