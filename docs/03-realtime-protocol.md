# 실시간 프로토콜

| Field | Value |
|-------|-------|
| Type | technical-design |
| Audience | engineering / reviewers |
| Status | draft |
| Source of truth | this document (채널·이벤트·동기화 규약) |
| Last reviewed | 2026-07-22 |

구현은 `src/lib/realtime/events.ts` (zod 스키마)와 각 도메인 훅이 반영한다.

## Context

참가자 전원의 화면이 같은 판 상태를 보여야 한다. 전용 서버가 없으므로 Supabase Realtime을 쓰되,
**전달 보장이 없는 pub/sub** 위에서 일관성을 만들어야 한다.

## 채널

방 하나당 채널 하나. 토픽 이름이 곧 권한 경계다.

```
room:{room_id}      Broadcast + Presence. private: true 로 구독
```

```ts
const channel = supabase.channel(`room:${roomId}`, {
  config: {
    private: true,                      // realtime.messages RLS 검사
    broadcast: { self: false, ack: true },
    presence: { key: userId },
  },
})
```

- `private: true` — 구독 시점에 `realtime.messages` RLS 정책으로 "이 방 참가자인가"를 검사한다.
  통과 후 커넥션 수명 동안 캐시되므로 메시지마다 DB를 치지 않는다.
- `self: false` — 자기 액션은 낙관적 UI로 이미 반영했으므로 되받지 않는다.
- `ack: true` — 서버 수신 확인. 재전송 판단에 쓴다.

**개인 채널은 만들지 않는다.** 내 손패처럼 나만 볼 정보는 브로드캐스트하지 않고 로컬 상태와
Postgres에만 둔다. 전파할 필요가 없는 데이터를 채널에 올리지 않는 것이 가장 확실한 격리다.

## 이벤트

모든 payload는 공통 봉투(envelope)를 가진다.

```ts
type Envelope<T> = {
  v: 1                  // 프로토콜 버전
  id: string            // 멱등키 (클라이언트 생성 UUID)
  roomId: string
  actorId: string       // 발신 사용자
  at: string            // ISO8601, 발신 시각
  payload: T
}
```

`v`를 두는 이유: 이벤트 모양이 바뀌어도 구버전 클라이언트가 조용히 오작동하지 않고
"지원하지 않는 버전"으로 명시적으로 무시할 수 있다.

### 이벤트 목록

| 이벤트 | 발신자 | 의미 | 확정 경로 |
|--------|--------|------|-----------|
| `member.joined` | 서버 | 참가자 입장 | Postgres |
| `member.role_changed` | host | 역할 변경 | Postgres |
| `round.started` | dealer | 새 판 시작 (`seq` 포함) | Postgres |
| `round.ended` | dealer | 판 종료 (승자·팟) | Postgres |
| `bet.placed` | player | 베팅 액션 제출 | Postgres |
| `bet.approved` | dealer | 승인 모드에서 수락 | Postgres |
| `bet.rejected` | dealer | 거절 (사유 포함) | Postgres |
| `bet.reverted` | dealer/host | 정정 (원장에 반대 행 추가) | Postgres |
| `chips.updated` | 서버 | 확정 잔액 델타 통지 | Postgres |
| `state.snapshot` | 서버 | 방 상태 전량 스냅샷 | — |
| `state.request` | 클라이언트 | 스냅샷 요청 | — |

`state.snapshot` / `state.request`가 이 프로토콜의 안전망이다. Broadcast는 전달을 보장하지
않으므로, 클라이언트는 불일치를 감지하면 스냅샷을 요청해 상태를 통째로 재수립한다.

### payload 예시

```ts
// bet.placed
{
  actionId: string      // = envelope.id. bet_actions PK 로 그대로 사용
  roundId: string
  action: 'check' | 'call' | 'raise' | 'fold' | 'allin'
  amount: number        // 정수 칩. check/fold 는 0
  seq: number           // 판 내 액션 순번 (클라이언트 추정치)
}

// chips.updated
{
  roundId: string | null
  deltas: Array<{ userId: string; delta: number; balance: number }>
  reason: 'bet' | 'pot_win' | 'buy_in' | 'correction' | 'settlement'
}
```

모든 수신 payload는 zod로 파싱한다. 실패하면 **적용하지 않고 경고만 남긴다** (요구 R2.2).
신뢰할 수 없는 입력을 상태에 반영하는 것보다 한 이벤트를 버리는 편이 안전하다 —
어차피 스냅샷으로 복구된다.

## 동기화 모델

```
사용자 탭
  │
  ├─(1) 로컬 상태 즉시 반영 (optimistic, actionId 부여)
  ├─(2) channel.send('bet.placed')        → 다른 참가자 화면 갱신 (체감 속도)
  └─(3) Server Action 호출                → 권한·규칙·불변식 검증 후 Postgres 커밋
            │
            └─(4) 서버가 'chips.updated' 브로드캐스트 → 전원 상태를 서버 값으로 정합
```

**충돌 시 항상 서버 값이 이긴다.** (2)는 표시용, (3)이 진실이다.
(3)이 실패하면 클라이언트는 낙관적 반영을 롤백하고 사유를 토스트로 보여준다.

### 멱등성

`actionId`(UUID)를 클라이언트가 만들고, `bet_actions.id`의 PK로 그대로 쓴다.
재연결 후 큐를 재전송해도 두 번째 INSERT는 충돌로 무시된다 (요구 R2.3).

### 순서

Broadcast는 전역 순서를 보장하지 않는다. 순서가 의미를 갖는 것은 **판 단위**뿐이므로:

- `rounds.seq`가 판 순서의 진실이다.
- 판 내 액션 순서는 서버가 커밋 시점에 `bet_actions.seq`를 확정한다. 클라이언트가 보낸 `seq`는
  추정치이며 표시용이다.
- 클라이언트가 자기 `seq`와 서버 `seq`가 어긋난 것을 발견하면 `state.request`를 보낸다.

### 재연결 복원

```
소켓 끊김 감지
  → 로컬 액션 큐 보존 (전송 실패분)
  → 재구독 (RLS 재검사)
  → Postgres 에서 방 상태 전량 로드 (rooms, room_members, 현재 round, 잔액 집계)
  → 큐에 남은 액션 재전송 (멱등키로 중복 흡수)
  → 로컬 상태 = 서버 상태로 치환
```

Postgres에서 복원하는 이유: Broadcast는 과거 메시지를 재생하지 않는다. 확정 상태의 소유자는
언제나 DB다 (`02-data-model.md`).

## Presence

접속자 표시에만 쓴다. 게임 상태를 Presence에 싣지 않는다 — Presence는 연결 상태에 따라
자동으로 사라지므로 게임 진실의 저장소로 부적절하다.

```ts
channel.track({ userId, displayName, seatNo, joinedAt })
```

`sync` / `join` / `leave` 이벤트로 참가자 목록 UI를 갱신한다.
딜러가 일정 시간 이상 `leave` 상태면 host에게 역할 재위임을 제안한다 (Edge Case 대응).

## 지연 목표와 측정

- 목표: 액션 발신 → 타 참가자 화면 반영 **p95 300ms**.
- 측정: envelope의 `at`과 수신 시각 차이를 개발 모드에서 기록. E2E에서 2개 브라우저 컨텍스트로 검증.
- 열화 시 점검 순서: ① 채널 구독 상태 ② RLS 정책 복잡도(구독 지연) ③ 네트워크 ④ payload 크기.

RLS 정책에 조인·함수 호출이 많거나 인덱스가 없으면 **구독·첫 메시지 지연**이 크게 늘어난다.
`is_room_member`가 `room_members(room_id, user_id)` 인덱스를 타는지 유지 확인할 것.

## 보안 경계

- 클라이언트가 보낸 값 중 **신뢰하는 것은 없다.** `actorId`조차 서버에서 세션과 대조한다.
- 채널 구독 권한은 애플리케이션이 아니라 `realtime.messages` RLS가 강제한다.
- 칩 증감은 Broadcast로 확정되지 않는다. Server Action + service role 경로만 원장에 쓴다.
- 손패(`hand_records`)는 판 종료 전까지 브로드캐스트하지 않는다.

## Open Questions

- [ ] `state.snapshot` 주기적 발신 간격(예: 15초) 도입 여부 — 유실 감지 지연과 트래픽의 트레이드오프.
- [ ] 액션 큐의 로컬 영속화 위치(메모리 vs `sessionStorage`) — 탭 새로고침 시 유실 허용 여부에 달림.
