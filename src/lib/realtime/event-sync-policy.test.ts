import { describe, expect, it } from 'vitest'
import { eventPayloads, type EventName } from './events'
import { SYNC_ACTION_BY_EVENT, syncActionFor } from './event-sync-policy'

describe('syncActionFor', () => {
  it('판 시작·종료·무효는 즉시 refetch다', () => {
    expect(syncActionFor('round.started')).toBe('immediate')
    expect(syncActionFor('round.ended')).toBe('immediate')
    expect(syncActionFor('round.voided')).toBe('immediate')
  })

  it('afterMutation이 발신하는 베팅·역할 이벤트도 스스로 refetch를 건다', () => {
    // 동반 state.snapshot은 보장이 아니다 — 발신자 자신의 refetch가 성공해야만 나간다
    // (use-room-actions.ts의 `if (result.success)`). 그 refetch가 8초 타임아웃으로
    // 실패하면 이 이벤트만 날아가므로, 이 이벤트가 재조회를 걸지 않으면 다른 참가자
    // 화면은 20초 폴링까지 낡은 팟을 들고 있는다.
    expect(syncActionFor('bet.placed')).toBe('coalesced')
    expect(syncActionFor('bet.approved')).toBe('coalesced')
    expect(syncActionFor('bet.rejected')).toBe('coalesced')
    expect(syncActionFor('bet.reverted')).toBe('coalesced')
    expect(syncActionFor('member.role_changed')).toBe('coalesced')
  })

  it('state.snapshot 자신과, 동반 보장이 없는 one-shot 이벤트는 coalesced다', () => {
    expect(syncActionFor('state.snapshot')).toBe('coalesced')
    expect(syncActionFor('member.left')).toBe('coalesced')
    expect(syncActionFor('room.settings_changed')).toBe('coalesced')
  })

  it('어떤 이벤트도 다른 이벤트의 동반 전송에 기대지 않는다 — 전부 스스로 refetch를 건다', () => {
    const names = Object.keys(eventPayloads) as EventName[]
    const withoutRefetch = names.filter(
      (name) => syncActionFor(name) !== 'immediate' && syncActionFor(name) !== 'coalesced',
    )
    expect(withoutRefetch).toEqual([])
  })

  it('eventPayloads에 정의된 이벤트 14개 전부 정책이 있다 (신규 이벤트 추가 시 이 테스트가 먼저 깨진다)', () => {
    const definedNames = Object.keys(eventPayloads)
    const policyNames = Object.keys(SYNC_ACTION_BY_EVENT)
    expect(policyNames.sort()).toEqual(definedNames.sort())
  })
})
