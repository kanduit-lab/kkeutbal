# 실시간 프로토콜

| Field | Value |
|-------|-------|
| Type | technical-design |
| Audience | engineering / reviewers |
| Status | active |
| Source of truth | 구현 프로토콜은 `src/lib/realtime/events.ts`·`client.ts`, 이 문서는 채널·이벤트·동기화 규약 |
| Last reviewed | 2026-08-02 |

## Context

참가자 전원의 화면이 같은 판 상태를 보여야 한다. 전용 서버가 없으므로 Supabase Realtime Broadcast를
쓰되, **전달 보장이 없는 pub/sub** 위에서 일관성을 만들어야 한다. 이 문서가 규정하는 것은 채널·이벤트
모양·동기화 순서다. 데이터 확정 경로(칩 원장, RLS)는 `02-data-model.md`.

## 채널

방 하나당 채널 하나. **공개 채널**이다 — `private: true`를 쓰지 않고 publishable key로 구독한다.

```ts
// src/lib/realtime/client.ts — createRoomChannel
supabase.channel(`room:${roomId}`, {
  config: {
    broadcast: { self: false, ack: true },
    presence: { key: userId },
  },
})
```

- `self: false` — 자기 액션은 Server Action 성공 뒤의 refetch로 이미 반영했으므로 되받지 않는다.
- `ack: true` (2026-07-30 변경) — 없으면 조인된 채널에서 `send()`가 서버 확인 없이 즉시 `'ok'`를
  돌려준다. 소켓이 살아 있는 것처럼 보이면서 패킷이 버려지는 모바일 구간을 잡으려면 실제 확인이
  필요하다. 전송당 왕복이 한 번 늘지만 payload가 작고, 호출부는 `afterMutation`에서 로컬 refetch
  뒤에 병렬로 기다리므로 조작 체감 지연은 없다. 재시도(`send-retry.ts`)가 중복 배달을 만들어도
  같은 envelope `id`를 재사용하므로 `seen-events.ts`의 dedup이 흡수한다.
- 채널 구독 자체에는 인가 검사가 없다. **payload를 신뢰하지 않는 것**과 **모든 쓰기를 Server
  Action이 권한 검사 후 수행하는 것**으로 방어한다 (아래 보안 경계).
- 개인 채널은 만들지 않는다. 손패처럼 나만 볼 정보는 애초에 브로드캐스트하지 않고 서버 응답으로만
  받는다.

## 이벤트

모든 payload는 공통 봉투(envelope)를 가진다 (`envelopeSchema`, `src/lib/realtime/events.ts`).

```ts
type Envelope = {
  v: 1              // PROTOCOL_VERSION
  id: string        // uuid, 멱등키
  roomId: string     // uuid
  actorId: string    // uuid, 발신 사용자
  at: string          // ISO8601 datetime
}
```

`parseEvent(name, raw)`가 이벤트 이름 + envelope + payload를 한 번에 zod로 검증한다. 실패하면
`null`을 반환하고 `onRoomEvent`의 구독 콜백은 아무것도 하지 않는다 — 파싱 실패 payload는 조용히
버려진다. 상태는 어차피 refetch로 복구되므로, 검증되지 않은 값을 반영하는 것보다 버리는 편이 안전
하다.

### 이벤트 목록과 실제 사용처

`eventPayloads`에 정의된 이벤트는 14개다.

발신 위치는 딜러 컨트롤·액션바·좌석 시트가 각자 훅으로 쪼개져 있다. 수신 처리는
`use-room-sync.ts`(refetch)와 `use-room-event-feedback.ts`(토스트·소리)가 나눠 갖는다.

| 이벤트 | 발신 위치 | 수신 처리 |
|--------|-----------|-----------|
| `round.started` | `dealer-panel-controls.ts`, `lobby-panel.tsx` | 토스트("N번째 판 시작") + refetch |
| `round.ended` | `dealer-panel-controls.ts`, `dealer-panel-pending-queue.tsx`, `use-action-bar-controls.ts` — 자동 종료가 승인·베팅 경로에서도 판을 끝내므로 발신 지점이 셋이다 | 토스트(승자·팟) + refetch |
| `round.voided` | `dealer-panel-controls.ts` | refetch (payload의 `reason`은 토스트 힌트) |
| `bet.placed` | `use-action-bar-controls.ts`, `member-sheet-proxy-bet.tsx`(대리 베팅) | refetch만 |
| `bet.approved` | `dealer-panel-pending-queue.tsx` | refetch만 |
| `bet.rejected` | `dealer-panel-pending-queue.tsx` | 자기 액션이면 토스트(거절 사유) + refetch |
| `bet.reverted` | `dealer-panel-revert-list.tsx` | refetch만 |
| `member.role_changed` | `member-sheet-role.tsx`, `member-sheet.tsx` | refetch만 |
| `member.left` | `member-sheet.tsx` — 채널 해제 직전이므로 `sendOneShotRoomEvent` 사용 | refetch만 |
| `room.settings_changed` | `room-settings-client.tsx` — 구독 채널 없는 화면이라 `sendOneShotRoomEvent` 사용 | refetch만 (payload 빈 객체) |
| `state.snapshot` | `use-room-actions.ts`의 `afterMutation` — mutation 성공 **그리고 발신자 자신의 refetch 성공** 시에만 (payload가 그 refetch 결과로 만들어지므로) | 힌트 반영 + refetch |
| `member.joined` | 스키마만 존재, 어디서도 send 안 함 | — |
| `state.request` | 스키마만 존재, 어디서도 send 안 함 | — |
| `chips.updated` | 스키마만 존재, 어디서도 send 안 함 | — |

`round.voided`/`member.left`/`room.settings_changed`는 2026-07-23 하드닝에서 스키마가 추가됐다.
수신 측은 다른 이벤트와 동일하게 "refetch 힌트"로만 다루고, 발신 연결은 각 기능 경로(판 무효·
방 나가기·설정 저장)가 담당한다.

수신 타입은 `RoomEvent` 판별 유니온(`src/lib/realtime/events.ts`)이다 — `event.name` 분기만으로
payload 타입이 캐스트 없이 좁혀진다. `useRoomSync`의 `onEvent` 콜백이 이 타입을 받는다.

payload 내용을 UI에 직접 반영하는 것은 토스트 문구를 가진 소수뿐이다 — `bet.rejected` /
`round.started` / `round.ended`, 그리고 신규 `round.voided`의 `reason`. 나머지 이벤트는
**"뭔가 바뀌었다" 신호일 뿐**이고, 실제 화면 갱신은 전부 `refreshRoom` 스냅샷 refetch가 담당한다.

### payload 예시

```ts
// bet.placed
{
  actionId: string      // 베팅 DB 멱등키. envelope.id와 독립적으로 생성
  roundId: string
  action: 'check' | 'call' | 'raise' | 'fold' | 'allin'
  amount: number         // 정수, nonnegative
  seq: number             // 클라이언트 추정 순번. 표시용, 진실 아님
}

// bet.rejected
{
  actionId: string
  rejectedBy: string
  reason: string          // 1~200자, 필수
}

// state.snapshot
{
  roomStatus: 'waiting' | 'playing' | 'settled' | 'closed'
  currentRound: { roundId: string; seq: number; pot: number } | null
  balances: Array<{ userId: string; balance: number }>
}
```

## 발신 모델 — 행동한 클라이언트가 직접 send

서버는 이벤트를 발신하지 않는다. `member.joined`, `chips.updated`가 스키마상 "서버" 발신으로
설계되었으나 실제 서버 발신 경로는 없다 — 미채택.

```
사용자 탭
  │
  ├─(1) Server Action 호출 (베팅 제출, 판 시작 등)
  │       → 권한·규칙·불변식 검증 후 Postgres 커밋
  │
  ├─(2) 성공 시 refetch(refreshRoom) 로 자기 화면 갱신
  │
  └─(3) 성공 시 channel.send(event)  ← 행동한 본인이 직접 브로드캐스트
          + (2)의 refetch도 성공했으면 state.snapshot 도 함께 send
            (afterMutation, use-room-actions.ts)
              │
              └─(4) 다른 참가자 수신 → 250ms 디바운스 refetch로 자기 화면 갱신
```

(3)의 `state.snapshot`은 **동반 전송이 보장되지 않는다.** payload를 (2)의 refetch 결과로
채우기 때문에, 그 refetch가 8초 타임아웃(`REFETCH_TIMEOUT_MS`)으로 실패하면 보낼 진실이 없어
생략된다 — 커밋은 됐는데 힌트만 안 나가는 구간이다. 따라서 **수신 측 어떤 이벤트도 "뒤따라올
`state.snapshot`이 대신 refetch해 준다"에 기대면 안 된다** (아래 이벤트별 재조회 정책).

실패한 Server Action은 아무것도 브로드캐스트하지 않는다 — 실패는 호출자 화면에 토스트로만
보인다 (`runAction`, `room-client.tsx`).

구독 중인 채널이 없는 화면(설정 페이지, 퇴장 직전)은 `sendOneShotRoomEvent`(`client.ts`)로 쏜다.
supabase-js는 미구독 채널의 `send`를 REST로 보내므로 웹소켓 구독 없이 이벤트 하나만 발신하고
채널을 바로 해제한다. 발신 실패는 조용히 삼킨다 — 브로드캐스트는 힌트일 뿐이고 수신자는
폴링으로 복구된다.

## 스냅샷 refetch 전략 — 진실의 원천

이벤트 payload는 힌트다. **진실은 항상 `refreshRoom(roomId)`가 반환하는 Postgres 스냅샷.**
`useRoomSync`는 다음 트리거로 refetch한다.

| 트리거 | 지연 |
|--------|------|
| `round.started`/`round.ended`/`round.voided` 수신 | 즉시 (디바운스 우회) |
| 그 외 Broadcast 이벤트 수신 | 250ms 트레일링 디바운스 + 최소 1초 간격 (`debouncedRefetch`) |
| Presence `sync` (참가자 입장/이탈 감지) | 250ms 트레일링 디바운스 + 최소 1초 간격 |
| 채널 `SUBSCRIBED` 전이 (최초 구독·재연결) | 즉시 |
| `visibilitychange`로 탭 복귀 + 20초 폴링 인터벌 | 즉시 / 20초 주기 |
| `online` 복귀 | 즉시 (+ 미연결이면 재구독) |

이벤트 유입 refetch만 최소 1초 간격으로 묶인다(폭주 시 서버 호출 상한). 첫 이벤트는 250ms
디바운스만 탄다. 폴링·visibility·afterMutation의 직접 refetch는 간격 제한을 받지 않는다.

`refreshRoom` 결과 `room.status`가 `settled`/`closed`면 결과 페이지로 라우팅한다. 별도의
"재연결 후 로컬 큐 재전송" 로직은 없다 — 클라이언트는 액션을 큐잉하지 않는다. Server Action 자체가
요청/응답이므로 실패하면 그 자리에서 사용자에게 보이고, 성공은 이미 Postgres에 반영된 뒤다.

### 이벤트별 재조회 정책

버킷은 `src/lib/realtime/event-sync-policy.ts`가 `Record<EventName, SyncAction>`으로 소유한다
(이벤트를 추가하면 정책을 안 넣는 순간 타입 에러 — 기본값 추측이 없다).

| 버킷 | 이벤트 | 수신 측 동작 |
|------|--------|--------------|
| `immediate` | `round.started`, `round.ended`, `round.voided` | 즉시 refetch. 판 전이는 판당 한 번뿐이라 폭주하지 않고, 새 판 데이터가 최대 1초 디바운스를 기다리던 공백을 없앤다 |
| `coalesced` | 나머지 전부 | 디바운스 refetch. `state.snapshot`도 여기 속한다 — 힌트로 즉시 칠하는 값(잔액·팟, `state-snapshot-hint.ts`) 외의 나머지(액션 로그·페어니스 단계·참가자)를 확정하는 것이 이 refetch다 |

**불변식: 어떤 이벤트도 다른 이벤트의 동반 전송에 기대지 않는다.** 2026-08-02 이전에는 세 번째
버킷 `passive`가 있었다 — `afterMutation`이 보내는 `bet.placed`/`approved`/`rejected`/
`reverted`·`member.role_changed`는 "항상 `state.snapshot`이 함께 오니까" 피드백(토스트·소리)만
하고 재조회를 안 걸었다. 그 전제가 틀렸다: 위 발신 모델대로 `state.snapshot`은 발신자 자신의
refetch가 성공해야만 나간다. 회선이 나쁘면 되돌리기는 커밋됐는데 `bet.reverted`만 날아가고,
다른 참가자 화면은 20초 폴링까지 낡은 팟을 들고 있었다(그 팟으로 액션바의 팟·하프 레이즈
프리셋이 계산된다 — `shared.ts`의 `raisePresets`). 전송을 무조건으로 바꾸는 선택지는 없다.
payload 자체가 실패한 refetch 결과로 만들어지므로 실을 진실이 없고, 뮤테이션 이전 값을 보내면
수신 측이 그 팟을 그대로 칠해서 침묵보다 나쁘다. 그래서 버킷을 없애고 전부 `coalesced`로 뒀다.
중복 걱정은 coalescer가 이미 흡수한다 — 이벤트와 동반 `state.snapshot`은 같은 버스트에 들어와
refetch 한 번을 공유하고, 상한은 `MIN_EVENT_INTERVAL_MS`다.

### 멱등성

`actionId` UUID를 클라이언트가 만들고 `bet_actions.id` PK로 쓴다. Realtime envelope UUID는 별도로
생성한다. 같은 Server Action 요청이 재전송돼도 두 번째 INSERT는 actionId PK 충돌로 흡수한다.

### 순서

Broadcast는 전역 순서를 보장하지 않는다. 순서가 의미를 갖는 판·액션 순번은 서버가 커밋 시점에
확정하며, 클라이언트가 이벤트에 실어 보내는 `seq`는 표시용 추정치일 뿐이다. 어긋남은 방치한다 —
다음 refetch가 서버 값으로 덮어쓴다.

### 스냅샷 반영 규칙

`useRoomSync`(`src/features/game/components/use-room-sync.ts`)가 두 가지 가드를 건다.

- **단조 순번 가드**: refetch는 시작 시 순번을 올리고, 응답 반영 시점에 **이미 반영된 순번보다
  클 때만** 스냅샷을 교체한다(`src/lib/realtime/snapshot-order.ts`) — 늦게 도착한 이전 응답이 더
  새 스냅샷을 덮어쓰지 않는다. 비교 대상은 "마지막으로 **발행된** 순번"이 아니다(2026-08-06 수정):
  refetch 왕복이 이벤트 간격(`MIN_EVENT_INTERVAL_MS`, 1초)보다 길어지는 회선에서는 응답이 돌아올
  때마다 이미 더 새 요청이 나가 있어 전부 버려졌고, 베팅이 몰릴수록 refetch만 갱신하는 값(액션
  로그, 그리고 그것으로 계산하는 차례 표시)이 버스트 내내 멈춰 있었다.
- **동일 내용 참조 유지**: 새 스냅샷이 기존과 내용이 같으면(JSON 직렬화 비교) 기존 참조를
  유지한다 — 무변화 폴링이 리렌더를 일으키지 않는다.

## 연결 복구와 실패 표면화

연결 수명 관리는 전부 `useRoomSync`가 소유한다. 소비자(RoomClient·MonitorClient)는 반환값만 본다.

### 재접속 정책

- **CLOSED 자동 재구독**: 채널이 `CLOSED`로 전이하면 지수 백오프 1s → 2s → 5s → 10s → 20s →
  30s(상한)로 채널을 처음부터 다시 구독한다. `SUBSCRIBED` 성공 시 백오프 카운터가 리셋된다.
- **수동 재접속(`reconnect`)**: 백오프 없이 즉시. `resetRealtimeSocket()`(`client.ts`,
  `realtime.disconnect()`)으로 웹소켓을 먼저 끊고 새 소켓으로 재구독한다 — 절전 복귀처럼 소켓은
  죽었는데 라이브러리는 살아있다고 믿는 상태를 뚫는다. 자동 재구독 시도 횟수(`MAX_RECONNECT_ATTEMPTS`)
  도 함께 0으로 되돌린다 — 수동 버튼·`online`·탭 복귀는 "조건이 달라졌다"는 신호인데, 카운터를
  그대로 두면 상한을 쓴 방이 재연결 한 번 더 실패하는 순간 다시 영영 자동 복구를 안 한다.
- **생명주기 트리거**: `pageshow`(bfcache 복원, `persisted`) → reconnect. `online` → refetch +
  미연결이면 reconnect. `offline` → connected=false. `visibilitychange` 복귀 → refetch +
  미연결이면 reconnect.
- **늦은 콜백 차단**: epoch 교체로 버려진 이전 채널의 상태 콜백은 무시한다(effect 스코프
  `disposed` 플래그) — 재접속 직후 이전 채널의 `CLOSED`가 새 연결 상태를 덮어써 "연결 끊김"
  오탐을 내는 것을 막는다.

### 실패 표면화

| 반환값 | 조건 | 의미 |
|--------|------|------|
| `connected=false` | 채널 오류·끊김·`offline` | 기존 배너 조건(`everConnected && !connected`) |
| `connectTimedOut` | **방에 들어온 시점부터** 10초 내 `SUBSCRIBED` 미도달 | 최초 연결 실패 — `everConnected`가 아직 false라 기존 배너 조건에 안 걸리는 구간을 메운다. 배너 조건에 `연결끊김 OR connectTimedOut`으로 더해 쓴다. 타이머는 채널 effect 밖(마운트 기준)에 있다 — 안에 두면 재구독 시도마다 초기화돼서, 백오프 초반 간격(1·2·5초)이 10초를 못 넘기는 동안 배너가 20~40초까지 밀린다 |
| `syncFailed` | refetch 연속 2회 실패 (Server Action reject 포함) | 채널과 무관하게 스냅샷 동기화 자체가 죽음. 성공 1회로 해제 |
| `authError` | `refreshRoom`이 `errors.loginRequired` 또는 `errors.notMember` 오류 키 반환 | 재시도로 복구 불가 — 재로그인·재입장 안내 필요. null이면 정상 |

## Presence

접속자 표시에만 쓴다. 게임 상태는 Presence에 싣지 않는다.

```ts
channel.track({ userId, displayName })
```

`sync` 이벤트에서 `presenceState()`의 키 집합을 온라인 사용자 셋으로 교체하고, 동시에
`debouncedRefetch()`를 호출한다(새 참가자 입장 감지 용도). `join`/`leave` 개별 이벤트는 구독하지
않는다. 딜러 이탈 시 자동 재위임 로직은 없다.

## 보안 경계

- 채널이 공개이므로 payload의 `actorId`를 포함해 **클라이언트가 보낸 값은 아무것도 신뢰하지
  않는다.** 화면 표시(토스트 문구 등)에만 쓰고, 권한·잔액 판단에는 절대 쓰지 않는다.
- 칩 증감은 Broadcast로 확정되지 않는다. 쓰기는 Server Action → `kkeutbal_app` 롤 경로만 원장에
  반영한다 (`02-data-model.md`).
- Broadcast로 확정되지 않는 값이 궁극적으로 화면에 반영되는 유일한 경로는 refetch다. 따라서 payload
  검증 실패·위조·유실 어느 쪽이든 최종 상태는 다음 refetch에서 정합된다.

## 미채택 대안

- **`private: true` 채널 + `realtime.messages` RLS 정책**: 현재는 Supabase JWT 브리지가 없어
  구현하지 않는다. 공개 채널을 유지하며, 쓰기 경로(Server Action)만 신뢰하는 모델을 택했다.
- **서버 발신 이벤트(`member.joined`, `chips.updated`)**: 스키마는 남아 있으나 발신 주체가 없다.
  Postgres 트리거나 Edge Function으로 서버발 브로드캐스트를 추가하지 않는 한 죽은 스키마다.
- **`state.request`/유실 감지 후 명시적 재요청**: 스키마만 있고 send하는 코드가 없다. 실제로는
  모든 이벤트가 정밀한 재요청 대신 "일단 refetch"로 뭉뚱그려 처리된다.

## Open Questions

- [ ] `member.joined`/`chips.updated`/`state.request` 스키마를 실사용에 맞춰 제거할지, 향후 서버
      발신 경로(Edge Function) 도입 시까지 유지할지.
- [ ] 20초 폴링 + 250ms 디바운스 조합의 실사용 지연 측정 — 별도 계측 없음, p95 목표치 미설정.
