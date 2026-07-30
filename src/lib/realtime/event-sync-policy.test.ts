import { describe, expect, it } from 'vitest'
import { eventPayloads } from './events'
import { SYNC_ACTION_BY_EVENT, syncActionFor } from './event-sync-policy'

describe('syncActionFor', () => {
  it('판 시작·종료·무효는 즉시 refetch다', () => {
    expect(syncActionFor('round.started')).toBe('immediate')
    expect(syncActionFor('round.ended')).toBe('immediate')
    expect(syncActionFor('round.voided')).toBe('immediate')
  })

  it('afterMutation이 항상 state.snapshot을 함께 보내는 이벤트는 피드백 전용이다', () => {
    expect(syncActionFor('bet.placed')).toBe('passive')
    expect(syncActionFor('bet.approved')).toBe('passive')
    expect(syncActionFor('bet.rejected')).toBe('passive')
    expect(syncActionFor('bet.reverted')).toBe('passive')
    expect(syncActionFor('member.role_changed')).toBe('passive')
  })

  it('state.snapshot 자신과, 동반 보장이 없는 one-shot 이벤트는 coalesced다', () => {
    expect(syncActionFor('state.snapshot')).toBe('coalesced')
    expect(syncActionFor('member.left')).toBe('coalesced')
    expect(syncActionFor('room.settings_changed')).toBe('coalesced')
  })

  it('eventPayloads에 정의된 이벤트 14개 전부 정책이 있다 (신규 이벤트 추가 시 이 테스트가 먼저 깨진다)', () => {
    const definedNames = Object.keys(eventPayloads)
    const policyNames = Object.keys(SYNC_ACTION_BY_EVENT)
    expect(policyNames.sort()).toEqual(definedNames.sort())
  })
})
