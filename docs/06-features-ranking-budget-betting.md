# 랭킹 · 베팅 · 예산

| Field | Value |
|-------|-------|
| Type | feature-spec |
| Audience | product / engineering / QA |
| Status | draft |
| Source of truth | this document (베팅 상태머신·예산 규칙·랭킹 지표 정의). 실제 구현은 아래 각 절의 소스 참조 |
| Last reviewed | 2026-07-22 |

데이터 구조는 `02-data-model.md`, 실시간 전파는 `03-realtime-protocol.md`가 소유한다.
이 문서는 이전 버전(설계 초안)과 실제 구현(`src/features/betting`, `src/features/budget`,
`src/features/ranking`, `src/features/game/actions.ts`)이 갈리는 지점을 실구현 기준으로 다시 썼다.
설계 의도와 구현이 다른 곳은 각 절 끝에 명시한다.

## Problem

공용 칩을 쓰면 개인 손익이 사라진다. 종이에 적으면 느리고 근거가 남지 않는다.
동시에, 한 사람이 전부 입력하면 그 사람만 게임을 못 한다.

## Goals

- 방 참가자가 각자 폰으로 베팅을 입력하고, 딜러가 필요 시 검수한다.
- 모든 칩 이동은 원장(`chip_ledger`)에 append-only로 남고, 정정은 반대 부호 행으로만 한다.
- 세션·누적 순손익을 원장에서 도출해 랭킹으로 보여준다.

## Non-goals

- 실제 화폐 정산 — 가상 칩만 다룬다.
- 그룹 스코프 누적 랭킹 — 스키마(`groups`/`group_members`)는 있으나 랭킹 쿼리는 아직 연결되지 않았다
  (`ranking/queries.ts` 참고, 아래 3절과 Open Questions).

## 1. 랭킹 · 기록

소스: `src/features/ranking/queries.ts`, `src/app/rooms/[code]/result/page.tsx`

### 범위

| 범위 | 쿼리 | 실제 대상 |
|------|------|-----------|
| 세션 | `getSessionStandings(roomId)` | 그 방의 `leftAt IS NULL`인 참가자 |
| 누적 | `getCumulativeRanking()` | `status IN ('settled', 'closed')`인 **모든 방**의 참가자, 그룹 필터 없음 |

**설계와 다른 점**: 이전 설계는 "전역 랭킹은 만들지 않는다"였다. 실제 `getCumulativeRanking`은
방 단위 그룹 스코프 없이 정산된 방 전체를 훑는다 — `groups`/`group_members` 테이블은 존재하지만
이 쿼리에 조인되지 않는다. 사실상 전역 누적 랭킹이다. Open Questions에 재정리.

### 세션 랭킹 — `StandingRow`

| 필드 | 도출 |
|------|------|
| `balance` | `SUM(chip_ledger.delta)` (방·유저 단위) |
| `buyInTotal` | `SUM(buy_ins.amount)` (방·유저 단위) |
| `net` | `balance − buyInTotal` |
| `wins` | `rounds.status = 'ended' AND rounds.winner_id = 유저` 개수 |
| `biggestPot` | 승리한 `ended` 판 중 `rounds.pot` 최댓값 |
| `raises` | `bet_actions.status = 'accepted' AND action = 'raise'` 개수 |
| `folds` | `bet_actions.status = 'accepted' AND action = 'fold'` 개수 |

정렬은 `net` 내림차순. **`leftAt`이 설정된 참가자는 이 목록에서 완전히 빠진다** — 단, 현재
코드베이스에 `leaveRoom` 같은 액션이 없어 `leftAt`을 세팅하는 경로 자체가 없다. 즉 지금은
전원이 항상 포함된다. 향후 이탈 기능이 생기면 이탈자의 원장 델타는 남는데 랭킹 표에서는
빠지므로, 화면에 보이는 `net` 합이 0이 아닐 수 있다(원장 자체의 합은 여전히 0).

**설계와 다른 점**: 참여 판수, 승률, 최다 연승, 다이율, 평균 베팅은 어디에도 계산되지 않는다.
`StandingRow`에 존재하는 지표는 위 표가 전부다. 이전 문서의 확장 지표 정의는 미구현 상태이며,
아래 Open Questions로 옮긴다.

### 누적 랭킹 — `CumulativeRow`

`settled`/`closed` 방 전체에서 `chip_ledger`·`buy_ins`·`rounds`·`room_members`를 IN 절로 훑어
유저별 `net`(위와 동일 정의), `wins`, `sessions`(그 방들에 대한 `room_members` 행 수)를 낸다.
`sessions` 집계는 `leftAt` 필터가 없다 — 중간에 나간 세션도 참여로 센다(세션 랭킹과 기준이 다름).
참여 판수 최소 기준에 따른 별도 표기는 구현되어 있지 않다.

### 판 기록 — `getRoundHistory(roomId)`

`status IN ('ended', 'voided')`인 판을 `seq` 역순으로 반환한다. `note`는 `rounds.result` jsonb의
`note` 키에서 뽑는다. 결과 화면(`result/page.tsx`)에서 무효 판은 "재경기" 배지로 표시된다.

### 재미 배지 — `result/page.tsx`에서 렌더 시점에 계산 (별도 함수 없음)

| 배지 | 실제 계산 기준 | 표시 조건 |
|------|----------------|-----------|
| 👑 MVP | `net` 1위 (standings[0], 이미 net 내림차순 정렬) | `net > 0` |
| 💥 한방 | `biggestPot` 최댓값 보유자 | `biggestPot > 0` |
| 🚜 불도저 | **`raises`(레이즈 횟수) 최댓값** 보유자 | `raises > 0` |
| 🦊 여우 | **`folds`(다이 횟수) 최댓값** 보유자 | `folds > 0` |

**설계와 다른 점**: 이전 문서는 불도저=평균 베팅 최고, 여우=다이율×순손익 양수 조합, 그리고
"호구"(순손익 최하위) 배지를 정의했다. 실구현은 훨씬 단순하다 — 불도저·여우는 각각 레이즈·다이
"횟수" 최댓값이고, 호구 배지는 코드에 없다. 동률 처리는 배열 정렬 순서에 맡겨져 있고 별도 규칙이
없다.

## 2. 원격 베팅

소스: `src/features/betting/actions.ts`, `src/features/game/actions.ts`(`voidRound`),
`drizzle/schema.ts`(`bet_actions`, `chip_ledger`)

### 입력 모드 — 방 생성 시 선택, 방 단위 고정값(`rooms.input_mode`)

| 모드 | 동작 |
|------|------|
| `trust` (신뢰) | 제출 즉시 `accepted` |
| `approval` (승인) | 딜러(`host`/`dealer`) 승인 전까지 `pending` — **단, 딜러 본인 입력·딜러의 대리 입력은 모드와 무관하게 즉시 `accepted`** |

한 명이 전담하는 "감사 모드"는 별도 모드가 아니라 `approval` + 딜러의 대리 입력으로 표현된다.
`enteredBy`가 본인이 아닌 대상을 위해 딜러가 넣은 값이면 채워지고, 그 행이 대리 입력 기록이다.

### 액션과 칩 이동

`check` · `call` · `raise` · `fold` · `allin`. 이 중 **`call`/`raise`/`allin`만 칩을 움직인다**
(`movesChips`). `check`/`fold`는 금액이 항상 0이고 원장 행이 생기지 않는다.
금액은 정수 칩만 허용(`z.number().int()`).

### 상태 전이 — `bet_actions.status`: `pending` / `accepted` / `rejected` / `reverted`

```
placeBet ──(trust 또는 딜러 본인/대리)──► accepted ──원장 기록(즉시)
    │
    └──(approval, 비딜러)──► pending ──approveBet──► accepted ──원장 기록
                                │              (재확인 시 잔액 부족이면 자동 rejected)
                                └──rejectBet──► rejected (사유 필수)

accepted ──revertBet(판 진행 중에만)──► reverted ──반대 부호 정정 행 삽입
pending/accepted (해당 판 전체) ──voidRound──► reverted 일괄 ──판 자체가 voided
```

- **멱등성**: `actionId`는 클라이언트 생성 UUID이자 PK. 같은 `actionId` 재전송은 재검증 없이
  기존 행을 그대로 반환한다.
- **잔액 검사**: `placeBet` 제출 시점, `approveBet` 승인 시점 각각 트랜잭션 내에서 재확인한다.
  승인 시점에 잔액이 부족해졌으면(그 사이 다른 지출) 사유 `"잔액 부족 (자동 거절)"`로 자동
  `rejected` 처리한다 — 승인자가 별도로 거절 사유를 입력할 필요가 없다.
- **`rejectBet`**: 딜러/방장만, 사유 필수(1~200자), `WHERE status = 'pending'` 조건으로만
  갱신해 이중 처리를 막는다.
- **`revertBet`**: 딜러/방장만, **대상 판이 아직 `playing`일 때만** 가능
  (`"끝난 판은 정정할 수 없습니다. 판 무효화를 사용하세요"`). 대상 액션이 현재 `accepted`일
  때만 성공한다. 원본 행은 상태만 `reverted`로 바뀌고, 원장에는 그 액션의 `bet` 행을 찾아
  반대 부호의 `correction` 행(`revertedOf`로 원본 참조)을 추가한다. `check`/`fold`처럼 원장
  행이 없던 액션은 원장 정정 없이 상태만 바뀐다.
- **`voidRound`**(판 전체 무효화, `game/actions.ts`): 개별 액션 정정과 다른 경로다. 현재
  `playing` 판의 아직 정정되지 않은 `bet` 원장 행을 전부 찾아 반대 부호 `correction` 행을
  일괄 삽입하고, 그 판의 `pending`/`accepted` 액션 전체를 `reverted`로 바꾼 뒤 판 자체를
  `voided`로 닫는다(`result.note`에 사유 저장).
- **판 종료(`endRound`)**: 그 판에 `pending` 액션이 하나라도 남아 있으면 거부된다
  (`"승인 대기 중인 베팅을 먼저 처리하세요"`). 팟은 `getRoundPot`으로 그 판 원장 델타 합의
  부호 반전으로 계산하고, 승자 원장에 `pot_win` 양수 행을 넣는다.

### 대리 입력

- `targetUserId` 지정은 호출자가 `host`/`dealer` 역할일 때만 허용된다.
- 대상은 방 참가자여야 하고, 베팅에서는 `observer` 역할이 대상이 될 수 없다.
- 대리로 넣은 행은 `enteredBy`에 실제 입력자를 남기고, `userId`는 대상 본인이다.

### 요구사항

- B1~B4(제출 UX, 낙관적 반영, 승인 큐, 되돌리기 가능성)는 위 상태 전이가 그대로 근거다.
- B5. 잔액을 초과하는 베팅은 서버에서 거부된다(`placeBet`/`approveBet` 양쪽에서 재확인).
  UI 측 사전 차단은 클라이언트 컴포넌트 책임 — 이 문서는 서버 계약만 규정한다.

## 3. 개인 예산

소스: `src/features/budget/actions.ts`, `src/features/game/actions.ts`(`createRoom`, `joinRoom`)

### 개념

- **최초 바이인**: 방 생성/입장 시 자동으로 기록된다 — `createRoom`은 방장에게, `joinRoom`은
  새 참가자에게 `rooms.starting_chips`만큼 `buy_ins` + `chip_ledger(reason: buy_in)` 행을
  즉시 만든다. 별도 확정 UI 단계는 없다.
- **추가 바이인**(`addBuyIn`): 본인은 언제든, 다른 사람 몫은 딜러/방장만 추가할 수 있다. 방이
  `settled`/`closed`면 거부된다. 금액은 1 이상 정수.
- **잔액(balance)**: `SUM(chip_ledger.delta)`. 저장 컬럼이 아니라 도출값이다.
- **순손익(net)**: `잔액 − 총 바이인`. 랭킹의 기준 값.

### 요구사항 — 구현 상태

| 요구 | 상태 |
|------|------|
| U1. 참가자는 입장 시 바이인을 확정한다 | 부분 구현 — 확정 UI 없이 `rooms.starting_chips`로 자동 기록됨 |
| U2. 추가 바이인은 기록으로 남고 순손익에 반영 | 구현됨 (`addBuyIn`) |
| U3. 잔액이 경고 임계값 이하면 표시 | **미구현** — 코드 어디에도 임계값 로직이 없다 |
| U4. 잔액은 음수가 될 수 없다 | `placeBet` 경로에서만 보장(지출 전 잔액 확인). DB 제약이나 `addBuyIn` 쪽 하한 검증은 없음 |
| U5. 세션 종료 시 전 참가자 순손익 합계는 정확히 0 | 원장 자체는 항상 0 합. **화면 표시**는 `leftAt` 필터링 대상이 생기면 어긋날 수 있음(1절 참고). 정산 화면에 이 검증·경고 UI는 없음 |

## Acceptance Criteria

- [ ] 승인 모드에서 딜러가 거절하면 제출자 화면에서 액션이 롤백되고 사유가 표시된다.
- [ ] 승인 모드에서 딜러 본인/대리 입력은 승인 큐를 거치지 않고 즉시 반영된다.
- [ ] 액션을 되돌린 뒤에도 원본 액션과 정정 원장 행이 모두 조회된다.
- [ ] 판 진행 중 되돌리기는 가능하지만, 판 종료 후에는 `revertBet`이 거부되고 무효화(`voidRound`)로
      유도하는 안내가 뜬다.
- [ ] 잔액 초과 베팅이 UI에서 제출 불가하고, 서버에서도 거부된다(이중 방어).
- [ ] `pending` 액션이 남아 있으면 판 종료가 거부된다.
- [ ] 세션 결과 화면에서 배지(MVP/한방/불도저/여우)는 표에 정의된 실제 계산 기준(횟수 기반)으로
      표시되고, 조건 미충족 시 해당 배지는 아예 표시되지 않는다.

## Edge Cases

| 상황 | 실제 동작 |
|------|-----------|
| 딜러가 자기 액션을 승인 대상으로 제출 | 승인 큐로 가지 않고 자동 `accepted`, `approvedBy`에 본인 기록 |
| 승인 대기 중 잔액이 부족해짐 | `approveBet`이 자동으로 `rejected` 처리, 사유 `"잔액 부족 (자동 거절)"` |
| 판이 끝난 뒤 특정 베팅만 되돌리려는 시도 | `revertBet` 거부 — 판 무효화(`voidRound`)만 가능 |
| 판 무효화 | 그 판의 미정정 `bet` 원장 전부 반환, 해당 판 모든 액션 `reverted`, 판 상태 `voided` |
| 추가 바이인 후 즉시 이탈 | 바이인 기록은 유지되나, `leftAt` 세팅 기능 자체가 아직 없어 실제로 발생하지 않음 |
| 같은 판에 승자 재입력 시도 | `endRound`는 `playing` 상태 판이 있을 때만 동작 — 이미 `ended`면 "진행 중인 판이 없습니다"로 거부 |
| 방이 정산된 뒤 오류 발견 | `closeRoom`은 되돌리는 액션이 없다. 정정하려면 별도 원장 보정 절차가 필요(코드에 없음, Open Question) |

## Dependencies

- `02-data-model.md` — `chip_ledger`, `bet_actions`, `rounds`, `buy_ins` 스키마.
- `03-realtime-protocol.md` — 베팅·판 상태 변화의 Broadcast 전파.

## Open Questions

- [ ] 누적 랭킹을 그룹(`groups`/`group_members`) 스코프로 제한할지, 현재처럼 전역으로 둘지 결정
      필요. 결정 시 `getCumulativeRanking` 구현과 이 문서를 함께 갱신.
- [ ] 참여 판수/승률/최다 연승/다이율/평균 베팅 지표를 실제로 만들지, 만든다면 어떤 쿼리로
      도출할지 확정 필요(현재 미구현).
- [ ] "호구" 배지 부활 여부 — 이전 설계엔 있었으나 구현되지 않음.
- [ ] U3(잔액 경고 임계값) 구현 여부와 임계값 확정 필요.
- [ ] 정산(`settled`) 완료 후 오류 정정 절차 — 현재 코드 경로 없음.
- [ ] 세션 결과 공유 방식 — 이미지 카드 생성 vs 링크. `08-ui-ux.md`와 연동.
