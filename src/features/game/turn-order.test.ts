import { describe, expect, it } from 'vitest'
import { isActorsTurn, nextActorId, type TurnAction } from './turn-order'

const accepted = (
  userId: string,
  action: TurnAction['action'],
  seq: number,
  status: TurnAction['status'] = 'accepted',
): TurnAction => ({ userId, action, seq, status })

describe('nextActorId', () => {
  it('라운드 시작 시(액션 없음) seatNo가 가장 낮은 "선"부터 시작한다', () => {
    expect(nextActorId(['a', 'b'], [])).toBe('a')
    expect(nextActorId(['b', 'a'], [])).toBe('b')
  })

  it('2인 — 서로 번갈아 가며 다음 차례를 가리킨다', () => {
    const participants = ['a', 'b']
    expect(nextActorId(participants, [accepted('a', 'call', 1)])).toBe('b')
    expect(nextActorId(participants, [accepted('a', 'call', 1), accepted('b', 'raise', 2)])).toBe(
      'a',
    )
  })

  it('3인 — 마지막 행동자 다음 좌석부터 시계방향으로 찾는다', () => {
    const participants = ['a', 'b', 'c']
    expect(nextActorId(participants, [accepted('a', 'raise', 1)])).toBe('b')
    expect(
      nextActorId(participants, [accepted('a', 'raise', 1), accepted('b', 'call', 2)]),
    ).toBe('c')
  })

  it('fold한 참가자는 건너뛴다', () => {
    const participants = ['a', 'b', 'c']
    const actions = [accepted('a', 'raise', 1), accepted('b', 'fold', 2)]
    expect(nextActorId(participants, actions)).toBe('c')
  })

  it('allin한 참가자도 건너뛴다', () => {
    const participants = ['a', 'b', 'c']
    const actions = [accepted('a', 'raise', 1), accepted('b', 'allin', 2)]
    expect(nextActorId(participants, actions)).toBe('c')
  })

  it('한 명만 남으면(1인 생존) 그 사람에게 순번이 돌아온다 — "완료 판정"은 이 함수 소관이 아니다', () => {
    // a가 레이즈하고 b가 fold하면 a 혼자 남지만, 이 함수는 "다음 차례가 누구냐"만 답한다.
    // "1인 남았으니 판이 끝났다"는 completeRoundCompletion(round-completion.ts)의 몫이다.
    const participants = ['a', 'b']
    const actions = [accepted('a', 'raise', 1), accepted('b', 'fold', 2)]
    expect(nextActorId(participants, actions)).toBe('a')
  })

  it('상대가 올인이고 나도 더 낼 이유가 없으면 null — 판을 끝내는 것은 round-completion의 몫', () => {
    // 짧은 올인 교착의 원인 절반이 여기다: a가 5000을 걸고 b가 500 올인이면, a가 마지막
    // 행동자가 되는 순간 b는 allin이라 건너뛰어져 후보가 사라진다. 이 함수는 없는 차례를
    // 만들어 내지 않는다 — "그러면 판이 끝난 것"이라는 판정은 `betting/round-completion.ts`가
    // 하고, 그쪽이 올인 참가자를 정산 완료로 본다.
    const participants = ['a', 'b']
    const actions = [accepted('a', 'raise', 1), accepted('b', 'allin', 2), accepted('a', 'check', 3)]
    expect(nextActorId(participants, actions)).toBe(null)
  })

  it('fold·allin이 아닌 참가자가 정말 하나도 없으면(전원 fold) null을 반환한다', () => {
    const participants = ['a', 'b', 'c']
    const actions = [accepted('a', 'fold', 1), accepted('b', 'fold', 2), accepted('c', 'fold', 3)]
    expect(nextActorId(participants, actions)).toBe(null)
  })

  it('10인 — 좌석을 한 바퀴 돌아 다시 첫 좌석으로 돌아온다', () => {
    const participants = Array.from({ length: 10 }, (_, i) => `p${i}`)
    const actions = [accepted('p9', 'call', 1)]
    expect(nextActorId(participants, actions)).toBe('p0')
  })

  it('관전자는 participantIds에서 아예 제외하고 넘겨야 한다 — 제외되면 건너뛴다', () => {
    // 관전자를 걸러낸 뒤 넘기는 것이 호출부의 책임이라, 걸러낸 배열만 통과한다.
    const participants = ['a', 'c'] // b는 관전자라 호출부가 이미 제외
    expect(nextActorId(participants, [accepted('a', 'call', 1)])).toBe('c')
  })

  it('마지막 행동자가 participantIds에 없으면(중도 퇴장) "선"부터 다시 찾는다', () => {
    const participants = ['a', 'c'] // b가 마지막으로 행동한 뒤 방을 나가 목록에서 빠졌다
    const actions = [accepted('a', 'call', 1), accepted('b', 'call', 2)]
    expect(nextActorId(participants, actions)).toBe('a')
  })

  it('pending·rejected·reverted 액션은 턴 진행에 영향을 주지 않는다', () => {
    const participants = ['a', 'b']
    const actions: TurnAction[] = [
      accepted('a', 'raise', 1),
      { userId: 'b', action: 'call', seq: 2, status: 'pending' },
    ]
    expect(nextActorId(participants, actions)).toBe('b')
  })

  it('참가자가 없으면 null', () => {
    expect(nextActorId([], [])).toBe(null)
  })
})

describe('isActorsTurn', () => {
  it('nextActorId와 일치하는 사용자만 true', () => {
    const participants = ['a', 'b']
    expect(isActorsTurn(participants, [], 'a')).toBe(true)
    expect(isActorsTurn(participants, [], 'b')).toBe(false)
  })
})
