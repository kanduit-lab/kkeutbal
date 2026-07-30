import { describe, expect, it } from 'vitest'
import { computeActionGateReason } from './action-bar-gate'

const MESSAGES = {
  foldedGate: '이번 판은 다이했어요',
  allinGate: '올인 완료',
  pendingGate: '딜러 승인 대기 중',
  notYourTurn: '{name}님 차례예요',
}

const BASE_STATUS = {
  lastAcceptedAction: null,
  hasPendingAction: false,
  isMyTurn: true,
  currentActorName: null,
  staleReason: null,
}

describe('computeActionGateReason', () => {
  it('마지막 accepted 액션이 fold면 foldedGate를 최우선으로 반환한다', () => {
    const reason = computeActionGateReason(
      { ...BASE_STATUS, lastAcceptedAction: 'fold', hasPendingAction: true, isMyTurn: false },
      MESSAGES,
    )
    expect(reason).toBe(MESSAGES.foldedGate)
  })

  it('마지막 accepted 액션이 allin이면 allinGate를 반환한다', () => {
    const reason = computeActionGateReason(
      { ...BASE_STATUS, lastAcceptedAction: 'allin' },
      MESSAGES,
    )
    expect(reason).toBe(MESSAGES.allinGate)
  })

  it('승인 대기 중인 내 액션이 있으면 pendingGate를 반환한다', () => {
    const reason = computeActionGateReason({ ...BASE_STATUS, hasPendingAction: true }, MESSAGES)
    expect(reason).toBe(MESSAGES.pendingGate)
  })

  it('내 차례가 아니면 상대 이름을 채운 notYourTurn을 반환한다', () => {
    const reason = computeActionGateReason(
      { ...BASE_STATUS, isMyTurn: false, currentActorName: '철수' },
      MESSAGES,
    )
    expect(reason).toBe('철수님 차례예요')
  })

  it('내 차례가 아니고 이름을 알 수 없으면 빈 문자열로 채운다', () => {
    const reason = computeActionGateReason(
      { ...BASE_STATUS, isMyTurn: false, currentActorName: null },
      MESSAGES,
    )
    expect(reason).toBe('님 차례예요')
  })

  it('막을 이유가 없으면 stale 사유를 그대로 통과시킨다', () => {
    const reason = computeActionGateReason(
      { ...BASE_STATUS, staleReason: '다시 연결한 뒤에 조작할 수 있어요' },
      MESSAGES,
    )
    expect(reason).toBe('다시 연결한 뒤에 조작할 수 있어요')
  })

  it('막을 이유도 stale 사유도 없으면 null이다', () => {
    expect(computeActionGateReason(BASE_STATUS, MESSAGES)).toBeNull()
  })

  it('우선순위: pending이 notYourTurn보다 앞선다', () => {
    const reason = computeActionGateReason(
      { ...BASE_STATUS, hasPendingAction: true, isMyTurn: false, currentActorName: '영희' },
      MESSAGES,
    )
    expect(reason).toBe(MESSAGES.pendingGate)
  })
})
