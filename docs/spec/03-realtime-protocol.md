# 실시간 프로토콜

| Field | Value |
|-------|-------|
| Type | technical-design |
| Audience | maintainers / operators / reviewers |
| Status | active |
| Source of truth | 이 문서는 실시간 전송 모드와 동기화 계약을 소유한다 |
| Last reviewed | 2026-10-21 |

## Requirement

방 참여자의 화면은 같은 서버 스냅샷으로 수렴해야 한다. 실시간 전송이 지연되거나 유실돼도
칩, 판, 좌석 상태를 이벤트 payload로 확정하지 않는다. `REALTIME_MODE`는 `supabase` 또는
`self`이며, 모드에 따라 전송 계층만 바뀐다.

`supabase`는 Supabase Broadcast와 Presence를 쓰고, `self`는 인증된 앱 API와 PostgreSQL만
사용한다. `self` 배포는 `0022_wakeful_swarm` 마이그레이션을 적용한 뒤 활성화한다.

## Contract

### 공통 동기화 규약

- 모든 이벤트는 **힌트**다. 수신자는 이벤트를 받으면 방 스냅샷을 다시 조회하고, 화면 상태는 그
  응답으로만 확정한다.
- 이벤트 유실, 중복, 순서 역전은 허용한다. 클라이언트는 탭 복귀, 온라인 복귀, 주기 폴링으로도
  스냅샷을 조회한다.
- 이벤트 payload와 발신자가 제공한 식별자는 권한·잔액·차례 판단에 쓰지 않는다. 쓰기는 인증과
  방 권한을 확인하는 서버 경로를 거쳐 Postgres 트랜잭션으로 확정한다.
- 액션 성공 뒤에는 발신자도 스냅샷을 다시 조회한다. 수신자 재조회는 중복 이벤트를 묶을 수 있지만,
  다른 이벤트의 동반 전송을 전제로 삼지 않는다.

### `REALTIME_MODE=supabase`

Supabase Broadcast와 Presence가 전송과 접속 표시를 담당한다. Broadcast는 상태 저장소가 아니며,
위 공통 동기화 규약을 그대로 따른다. 브라우저는 런타임 설정 API에서 공개 연결 값을 받아
Supabase 클라이언트를 만든다. 공개 값은 이미지에 굽지 않는다.

### `REALTIME_MODE=self`

`self` 모드는 다음 경계를 모두 갖는다.

- 브라우저는 같은 origin의 인증된 SSE 스트림으로 이벤트를 수신한다. 스트림 연결 시 서버는 세션과
  방 멤버십을 확인한다.
- 브라우저는 같은 origin의 인증된 `POST` 경로로만 이벤트 발행을 요청한다. 서버는 세션과 방
  멤버십을 다시 확인한 뒤에만 publish한다.
- 서버 프로세스는 PostgreSQL `LISTEN/NOTIFY`를 받아 해당 방의 SSE 구독자에게 힌트를 전달한다.
  `NOTIFY` payload도 스냅샷을 대신하지 않는다.
- 접속 표시는 DB lease presence로 관리한다. 연결은 lease를 만들거나 갱신하고, 만료된 lease는
  온라인 사용자로 보지 않는다. SSE 연결 종료만으로 presence를 즉시 확정하지 않는다.
- `self`는 요청마다 종료되는 실행 환경에서 동작하지 않는다. long-running Node 프로세스와
  PostgreSQL session listener 연결이 함께 있어야 한다.

`self`를 선택한 서버는 시작할 때 listener 연결을 열며, 환경값이나 listener 연결이 잘못되면
요청을 받기 전에 기동을 실패시킨다. 같은 단계에서 lease 테이블의 존재와 조회 권한도 확인하므로
`0022_wakeful_swarm` 적용 전에는 이 모드를 켤 수 없다.

### 채널과 envelope

방 하나가 전송 채널 하나를 가진다. Supabase 토픽은 `room:{roomId}`, self 경로는
`/api/realtime/rooms/{roomId}`다. 모든 방 이벤트는 같은 envelope를 쓴다.

```ts
type Envelope = {
  v: 1
  id: string
  roomId: string
  actorId: string
  at: string
}
```

`parseEvent(name, raw)`가 이름·envelope·payload를 함께 검증한다. 실패한 입력은 버리고 다음
스냅샷 조회로 복구한다. Supabase 모드의 `actorId`는 클라이언트가 만들므로 신뢰하지 않는다.
self 모드는 서버가 인증 세션에서 `actorId`를 만들지만, 이벤트 payload 자체는 여전히 힌트다.

Supabase 채널은 `broadcast.self=false`, `broadcast.ack=true`, `presence.key=userId`를 쓴다.
공개 채널이므로 개인 손패나 인증 정보는 보내지 않는다. self의 SSE와 POST는 세션과 방 멤버십을
각각 확인하고, POST는 same-origin과 분당 발행 한도도 확인한다. self connection은 임의의
source UUID를 공유해 발신 탭만 echo에서 제외하며, 같은 사용자의 다른 탭은 이벤트를 받는다.

### 이벤트 목록

이름과 payload 스키마의 정본은 `src/lib/realtime/events.ts`다.

| 이벤트 | 실제 발신 경로 | 수신 동작 |
|--------|----------------|-----------|
| `round.started` | 딜러·로비 판 시작 | 즉시 재조회 + 피드백 |
| `round.ended` | 종료·승인·베팅 자동 종료 | 즉시 재조회 + 피드백 |
| `round.voided` | 딜러 판 무효 | 즉시 재조회 |
| `bet.placed` | 액션바·대리 베팅 | 합쳐서 재조회 |
| `bet.approved` | 승인 대기열 | 합쳐서 재조회 |
| `bet.rejected` | 승인 대기열 | 합쳐서 재조회 + 해당 사용자 피드백 |
| `bet.reverted` | 되돌림 목록 | 합쳐서 재조회 |
| `member.role_changed` | 역할·방장 변경 | 합쳐서 재조회 |
| `member.left` | 참가자 제거 | 합쳐서 재조회 |
| `room.settings_changed` | 설정 저장 화면의 one-shot 발행 | 합쳐서 재조회 |
| `state.snapshot` | mutation 뒤 발신자 재조회까지 성공했을 때 | 제한된 힌트 반영 + 확인 재조회 |
| `member.joined` | 현재 발신 없음 | 스키마만 유지 |
| `chips.updated` | 현재 발신 없음 | 스키마만 유지 |
| `state.request` | 현재 발신 없음 | 스키마만 유지 |

`state.snapshot`은 동반 전송이 보장되지 않는다. 발신자의 mutation은 성공했어도 그 뒤 재조회가
실패하면 만들 수 없는 payload이므로 보내지 않는다. 수신 측은 다른 이벤트가 뒤따를 것이라고
가정하지 않는다.

### 발신 순서

```text
사용자 탭
  -> Server Action: 권한·규칙 검사와 PostgreSQL 커밋
  -> 성공한 발신자: refreshRoom으로 자기 화면 확정
  -> 공통 realtime connection으로 이벤트 힌트 발행
  -> 다른 참가자: 이벤트 수신 뒤 refreshRoom으로 서버 스냅샷 확정
```

설정 저장처럼 구독 connection이 없는 화면은 one-shot 발행을 쓴다. Supabase 모드는 미구독
채널의 REST fallback을 사용하고, self 모드는 같은 인증 POST 경로를 사용한다. 발행 실패가 이미
성공한 mutation을 실패로 바꾸지는 않는다. 상대 화면은 폴링으로 수렴한다.

Supabase 전송은 같은 envelope id로 최대 세 번 재시도한다. 수신자는 `seen-events.ts`로 중복
피드백을 막는다. self의 POST는 서버가 새 envelope를 한 번 만들고 `NOTIFY`한다.

### 스냅샷 재조회 정책

진실은 항상 `refreshRoom(roomId)`가 반환하는 PostgreSQL 스냅샷이다.

| 트리거 | 동작 |
|--------|------|
| `round.started`·`round.ended`·`round.voided` | 즉시 재조회 |
| 그 밖 이벤트·새 참가자 presence | 250ms 디바운스, 이벤트 재조회 최소 1초 간격 |
| 연결 성공 | 즉시 재조회 |
| 탭 복귀·온라인 복귀·bfcache 복원 | 즉시 재조회, 필요하면 재연결 |
| 탭이 보이는 동안 | 20초 폴링 |

버킷의 정본은 `src/lib/realtime/event-sync-policy.ts`다. `state.snapshot`도 제한된 값을 먼저
칠할 뿐 확인 재조회를 생략하지 않는다. refetch 응답은 `snapshot-order.ts`의 단조 순번 가드를
통과한 것만 반영해 늦게 도착한 이전 응답이 새 상태를 덮지 못하게 한다. 내용이 같으면 기존
참조를 유지해 무변화 폴링의 리렌더를 피한다.

액션 멱등키와 realtime envelope id는 별개다. 베팅의 `actionId`는 DB PK라 요청 재전송을
흡수하고, envelope id는 중복 피드백만 막는다. 전역 이벤트 순서는 보장하지 않으며, 판·액션 순번은
서버 커밋과 다음 스냅샷이 확정한다.

### 연결 복구와 실패 표면

`useRoomSync`가 전송 종류와 무관하게 연결 수명을 소유한다.

- `CHANNEL_ERROR`, `TIMED_OUT`, `CLOSED`는 지수 백오프로 connection을 새로 만든다. 성공하면
  시도 횟수를 초기화한다.
- 수동 재연결, 온라인 복귀, 탭 복귀는 백오프를 초기화하고 즉시 새 연결을 시도한다.
- 교체된 이전 connection의 늦은 콜백은 effect의 `disposed` 상태로 무시한다.
- 최초 연결이 10초 안에 성공하지 않으면 `connectTimedOut`을 켜고, 스냅샷 재조회가 연속 두 번
  실패하면 `syncFailed`를 켠다. 인증·멤버십 오류는 `authError`로 분리한다.

연결 배너는 `connected`, `everConnected`, `connectTimedOut`을 함께 사용한다. 실시간 연결 실패와
서버 스냅샷 실패는 다른 상태이며, 어느 쪽도 조용히 정상처럼 보이면 안 된다.

### Presence

Presence는 접속 표시만 소유하고 게임 상태는 싣지 않는다. Supabase 모드는 채널 presence key
집합을 쓰고, self 모드는 `room_connections`의 만료형 lease를 쓴다. self 연결은 15초마다
lease를 갱신하며 45초가 지나면 오프라인으로 본다. 프로세스가 비정상 종료돼도 만료된 행은
온라인 판정에서 제외하고 이후 연결 등록·조회 때 정리한다. 알려진 참가자의 일시적인 연결 변화는
재조회를 만들지 않고, 스냅샷에 없는 사용자 id가 나타날 때만 참가자 목록을 다시 읽는다.

### 보안 경계

- 이벤트 payload는 화면 갱신 힌트와 피드백에만 쓴다. 권한·잔액·차례·정산은 Server Action과
  PostgreSQL 스냅샷이 결정한다.
- 개인 정보와 비공개 손패는 두 전송 모드 모두 이벤트에 넣지 않는다.
- Supabase 공개 채널의 발신자와 self POST의 payload를 신뢰하지 않는다. self 서버가 확정하는
  값은 인증된 `actorId`, 방 id, envelope id와 시각뿐이다.
- 파싱 실패·위조·유실·중복이 있어도 다음 재조회가 최종 상태를 복구해야 한다.

### 데이터베이스 연결 조건

`DATABASE_POOL_MODE`는 `session` 또는 `transaction`이다. `LISTEN/NOTIFY` listener는 반드시
session-capable 연결을 사용한다.

- `REALTIME_MODE=self`이고 기본 DB 연결이 `session`이면 `REALTIME_SELF_LISTENER_URL`을 생략할 수
  있다. 이때 listener는 기본 DB 연결과 분리된 장기 session을 연다.
- `REALTIME_MODE=self`이고 `DATABASE_POOL_MODE=transaction`이면 `REALTIME_SELF_LISTENER_URL`이
  필수다. 이 URL은 direct 또는 session pool endpoint여야 하며 transaction endpoint여서는 안 된다.
- `REALTIME_MODE=supabase`에서는 listener URL이 필요하지 않다.

TLS 설정은 `DATABASE_TLS_MODE=disable | verify-system | verify-ca`로 제한한다. `verify-ca`는
`DATABASE_CA_CERT_BASE64`를 요구하며, 다른 TLS 모드에서 이 CA 값을 요구하지 않는다.
`disable`은 신뢰할 수 있는 로컬 네트워크처럼 TLS가 별도 계층에서 보장되는 환경에만 사용한다.

## Boundary

방 상태의 스키마·권한·원장 불변식은 `02-data-model.md`가 소유한다. 컨테이너 실행 환경과 변수
주입 경계는 `11-container-build-contract.md`가 소유한다. 실제 DB migration의 작성·적용·복구 절차는
`../runbooks/01-database-migrations.md`가 소유한다.

## Verification

코드와 `0022_wakeful_swarm` 마이그레이션 파일은 구현돼 있다. 대상 DB에는 아직 적용하지 않았으므로
`self`의 실제 연결 검증은 마이그레이션 적용 뒤 수행한다.

- `supabase`와 `self`가 각각 유효하지 않은 다른 전송 경로를 열지 않는지 확인한다.
- SSE와 POST가 인증되지 않았거나 방 멤버가 아닌 요청을 거부하는지 확인한다.
- DB listener 연결이 session-capable endpoint만 쓰는지 확인한다.
- 이벤트 유실·중복·순서 역전 뒤에도 폴링 또는 재조회로 서버 스냅샷에 수렴하는지 확인한다.
- lease 만료 뒤 접속 표시가 정리되고, 만료 전에는 일시적인 전송 단절만으로 사용자를 이탈로
  확정하지 않는지 확인한다.
