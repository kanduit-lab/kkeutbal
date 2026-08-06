import { describe, expect, it } from 'vitest'
import { selfRoleSwitchBlockReason } from './member-sheet-gating'

describe('selfRoleSwitchBlockReason', () => {
  it('판이 없으면 플레이어가 스스로 관전으로 내려갈 수 있다', () => {
    expect(selfRoleSwitchBlockReason({ selfRole: 'player', hasRound: false })).toBeNull()
  })

  it('판이 없으면 관전자가 스스로 다시 참가할 수 있다', () => {
    expect(selfRoleSwitchBlockReason({ selfRole: 'observer', hasRound: false })).toBeNull()
  })

  it('판이 도는 중에는 막되 이유를 남긴다 — 좌석 구성이 바뀌면 턴 순서가 어긋난다', () => {
    expect(selfRoleSwitchBlockReason({ selfRole: 'player', hasRound: true })).toBe('duringRound')
    expect(selfRoleSwitchBlockReason({ selfRole: 'observer', hasRound: true })).toBe('duringRound')
  })

  it('방장은 자기 역할을 바꿀 수 없다 — 위임이 먼저다', () => {
    expect(selfRoleSwitchBlockReason({ selfRole: 'host', hasRound: false })).toBe('host')
  })

  it('딜러는 방장이 준 권한이라 스스로 반납하지 못한다', () => {
    expect(selfRoleSwitchBlockReason({ selfRole: 'dealer', hasRound: false })).toBe('roleLocked')
  })

  it('방장·딜러 판정이 판 진행 여부보다 앞선다', () => {
    expect(selfRoleSwitchBlockReason({ selfRole: 'host', hasRound: true })).toBe('host')
    expect(selfRoleSwitchBlockReason({ selfRole: 'dealer', hasRound: true })).toBe('roleLocked')
  })
})
