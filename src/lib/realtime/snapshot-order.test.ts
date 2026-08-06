import { describe, expect, it } from 'vitest'
import { SnapshotOrderGuard } from './snapshot-order'

describe('SnapshotOrderGuard', () => {
  it('순서대로 도착한 응답은 모두 반영한다', () => {
    const guard = new SnapshotOrderGuard()
    const a = guard.issue()
    expect(guard.accept(a)).toBe(true)
    const b = guard.issue()
    expect(guard.accept(b)).toBe(true)
  })

  it('늦게 도착한 이전 응답은 최신 스냅샷을 덮어쓰지 않는다', () => {
    const guard = new SnapshotOrderGuard()
    const first = guard.issue()
    const second = guard.issue()

    // 나중에 시작한 쪽이 먼저 돌아온다 — 이게 화면에 남아야 한다.
    expect(guard.accept(second)).toBe(true)
    expect(guard.accept(first)).toBe(false)
  })

  it('겹친 요청이 쌓여도 도착한 것 중 가장 최신은 반영된다 (기아 방지)', () => {
    // 회선이 느려 refetch가 1초보다 오래 걸리는 동안 이벤트가 계속 들어오는 상황:
    // 응답이 돌아올 때마다 이미 더 새 요청이 나가 있다. "마지막으로 발행된 것과
    // 같을 때만" 반영하면 버스트 내내 화면이 얼어붙는다.
    const guard = new SnapshotOrderGuard()
    const inflight = [guard.issue(), guard.issue(), guard.issue()]
    guard.issue()

    expect(guard.accept(inflight[0]!)).toBe(true)
    expect(guard.accept(inflight[1]!)).toBe(true)
    expect(guard.accept(inflight[2]!)).toBe(true)
  })

  it('같은 순번을 두 번 반영하지 않는다', () => {
    const guard = new SnapshotOrderGuard()
    const seq = guard.issue()
    expect(guard.accept(seq)).toBe(true)
    expect(guard.accept(seq)).toBe(false)
  })

  it('거절된 응답은 이후 응답의 판정 기준을 바꾸지 않는다', () => {
    const guard = new SnapshotOrderGuard()
    const first = guard.issue()
    const second = guard.issue()
    const third = guard.issue()

    expect(guard.accept(second)).toBe(true)
    expect(guard.accept(first)).toBe(false)
    expect(guard.accept(third)).toBe(true)
  })
})
