# 12. 인수인계 — 조사 기록

| Field | Value |
|-------|-------|
| Type | technical-design |
| Audience | engineering |
| Status | active |
| Source of truth | 조사 근거와 미확정 설계 질문은 이 문서. 실행 항목과 완료 기준은 [`TODO.md`](../TODO.md) |
| Last reviewed | 2026-07-30 |

세션이 바뀌어도 조사 결과가 날아가지 않게 누적하는 문서다. 각 섹션은 **무엇이 잘못됐고
어디가 근거인지**, 그리고 **사용자가 정해줘야 구현이 시작되는 것**만 담는다. 구현 순서와
완료 기준은 `TODO.md`가 소유하므로 여기 옮겨 적지 않는다.

섹션 번호는 `TODO.md`가 참조하므로 재사용하지 않는다. 배포까지 반영된 항목은 삭제한다.

---

## 10. 방 화면에서 족보 판독으로 가는 진입점 없음

> **해결 (2026-07-30)** — 방 헤더에 `/advisor?game={gameType}` 링크를 붙였고 어드바이저가
> `?game=`을 zod로 받아 해당 탭으로 연다. **현재 판의 카드는 넘기지 않는다** — 공정 딜 방에서
> 서버가 아는 카드를 채워주면 [`docs/10-virtual-credit-and-fair-play.md`](10-virtual-credit-and-fair-play.md)의
> 신뢰 모델과 충돌하기 때문이다. 아래 미확정은 이 결정으로 닫혔다.

두 화면이 코드 수준에서 완전히 분리돼 있다.

- `/advisor` 링크는 저장소 전체에서 홈 화면 한 곳뿐이다(`src/app/(home)/page.tsx`). `src/features/game/` 어디에도 `/advisor` 참조가 없다.
- 방 헤더(`src/features/game/components/room-header.tsx`)에는 결과·모니터·설정 아이콘 세 개가 있고 족보 판독은 없다.
- `AdvisorClient`(`src/features/jokbo-advisor/components/advisor-client.tsx`)는 `searchParams` 등 외부에서 초기 카드 상태를 받는 경로가 없다. 방에서 넘어가도 카드를 처음부터 다시 고른다.

### 미확정

현재 판의 카드를 미리 채워 넘길지. 이 앱은 참가자가 실물 화투를 보고 직접 입력하는 구조이고
카드 자동 인식은 사진 업로드 vision뿐이다. 공정 딜(`fairness`) 방에서는 서버가 덱을 알 수도
있는데, 서버가 아는 카드를 자동으로 채워주는 것이 신뢰 모델과 충돌하는지
[`docs/10-virtual-credit-and-fair-play.md`](10-virtual-credit-and-fair-play.md) 기준으로
먼저 판단해야 한다.

---

## 9. 판 자동 종료 없음 — 전원 콜, 전원 다이

> **해결 (2026-07-30)** — 판정은 `src/features/betting/round-completion.ts`의 순수 함수
> `computeRoundCompletion`이 하고(`active` / `showdown_ready` / `single_survivor`),
> `placeBet`·`approveBet`가 베팅을 accept한 직후 같은 트랜잭션에서
> `src/features/game/round-finalize.ts`의 `autoSettleRoundIfComplete`를 호출한다.
> 1인 생존은 항상 자동 종료. 검증 딜 방은 시드 봉인 후 기존 쇼다운 경로로 완전 자동 판정,
> 비검증 방의 2인 이상 쇼다운은 서버가 카드를 몰라 딜러 승자 확정 폼을 자동으로 연다.
> 딜러의 수동 종료·판 무효 버튼은 탈출구로 남겼다. "다음 세션"은 판(round) 전환으로만
> 구현하고 새 상위 단위는 만들지 않았다 — 이 저장소에서 "세션"은 이미 방 하나를 뜻한다.

트리거가 다른 두 종료 조건을 함께 다룬다. (a) 다이 안 한 나머지 전원이 콜해서 베팅이 끝난
경우, (b) 한 명 빼고 전원 다이한 경우. (b)는 승자가 마지막 생존자로 자명해서 카드 판정 없이
정산까지 자동화할 여지가 있다.

### 근거

- `src/features/betting/actions.ts`의 `placeBet`/`approveBet`는 베팅 금액만 검증한다. "non-fold 참가자 전원의 누적 베팅이 같아졌다"를 감지하는 코드가 없다.
- fold는 `bet_actions`에 기록만 된다(`actions.ts:106` `if (action === 'fold') return null`). "생존자가 1명"을 감지하는 코드가 없다.
- `endRound`(`src/features/game/round-actions.ts:159`)는 딜러가 "🏁 종료"를 눌러야만 호출된다. pending 베팅 잔류만 막고 콜 완료 여부는 보지 않는다.
- `startRound`도 딜러 수동 트리거다.
- `drizzle/schema.ts`의 `rounds`에는 `status`(`playing`/`ended`/`voided`)만 있고 street/phase 컬럼이 없다. `bet_actions`는 `roundId` 안에서 단일 `seq` 시퀀스다. 포커의 프리플랍·플랍·턴·리버 같은 다중 스트리트 개념이 스키마에 없다. 섯다는 원래 단일 벳 라운드라 지금까지 문제가 안 됐다.
- [`docs/04-game-engines.md`](04-game-engines.md)의 "엔진 계약(공통 인터페이스 — 미구현)"이 이미 밝혀둔 상태다. `features/game/`은 판 종료 시 어떤 엔진도 호출하지 않고 승자는 딜러가 지정한다.

### 8번과의 순서

"한 바퀴 돌았다"를 판정하려면 누가 액션했고 누가 안 했는지를 정확히 알아야 하는데, 지금은
서버에 턴 개념이 없어 같은 사람이 여러 번 베팅할 수 있다. 그 상태로 종료 판정을 얹으면
판정 자체가 부정확해진다. 8번이 선행이다.

### 미확정

**용어 충돌.** 사용자 요청은 "베팅 한 바퀴가 끝나면 다음 세션으로 넘어가야 한다"였다.
이 저장소에서 "세션"은 이미 방 하나를 뜻한다 — `session_standings(room_id)` 뷰,
`getMyRecentSessions()`, `getSessionStandings(roomId)`, 딜러 패널의 "세션 정산" 버튼이
실제로 `closeRoom(roomId)`를 부른다. 문맥상 사용자가 말한 것은 다음 **판(round)** 으로
보이지만, 방을 여러 단위로 쪼개는 새 상위 개념을 원한 것일 수도 있다. 구현 전에 확인할 것.

**종료 후 자동화 범위.** 콜 완료 케이스에서 승자 지정까지 엔진이 자동 판정하게 하면
`docs/04-game-engines.md`가 명시한 "판 종료 시 엔진 미호출" 설계를 바꾸는 큰 변경이다.
전원 다이 케이스는 카드 판정이 필요 없어 완전 자동이 상대적으로 안전하다.

**realtime 이벤트.** 현재 `round.started`/`round.ended`/`round.voided`뿐이라 "베팅 라운드
종료" 이벤트를 새로 정의해야 할 수 있다([`docs/03-realtime-protocol.md`](03-realtime-protocol.md)).

---

## 8. 베팅 턴 검증 부재 — 재현 가능한 버그

> **해결 (2026-07-30)** — 턴 계산을 `src/features/game/turn-order.ts`(순수 함수)로 빼서
> 서버(`validateBetSemantics`, placeBet·approveBet 공용)와 좌석 강조(`game-table.tsx`),
> 좌석 시트(`member-sheet.tsx`)가 같은 함수를 쓴다. 위반은 `errors.notYourTurn`.
> 좌석 순서는 seatNo 오름차순이고 그 근거는 `startRound`가 `round_fairness_participants.dealOrder`
> ("선" = index 0)를 같은 배열 인덱스로 채우는 것이다. **찾은 버그 둘**: 기존 `nextActorId`는
> (a) 라운드 시작 직후 accepted 액션이 없으면 `null`을 반환해 첫 액션자가 정해지지 않았고,
> (b) 마지막 행동자가 중도 퇴장하면 영구히 `null`을 반환해 교착이었다. 둘 다 "선"부터
> 재탐색으로 고쳤다. 표시 전용일 때는 드러나지 않던 문제다.

한 사람이 자기 차례가 아닌데도, 또는 남의 차례를 건너뛰고 연속으로 베팅할 수 있다.

### 근거

`placeBet`(`src/features/betting/actions.ts:126`)이 부르는 유일한 검증은
`validateBetSemantics`(`actions.ts:62-124`)이고, 확인하는 것은 두 가지뿐이다.

- 호출자 본인의 마지막 accepted 액션이 fold/allin이었는지(`actions.ts:76-90`)
- 금액이 콜·레이즈 규칙에 맞는지(`actions.ts:103-123`)

**차례를 확인하는 코드가 없다.** 그래서 A가 방금 call/raise를 했어도 곧바로 다시 `placeBet`을
부르면 accepted 되고, B가 한 번도 액션하지 않았는데 A가 건너뛰고 또 베팅해도 막히지 않는다.

턴 순서 계산은 저장소 전체에서 `src/features/game/components/game-table.tsx:102-123`의
`nextActorId` 하나뿐인데, 클라이언트 `useMemo`로 좌석 골드 링 하이라이트에만 쓰인다
(`game-table.tsx:227`, `:264-266`). 서버에 대응 로직이 없으므로 **그 하이라이트는 현재
아무것도 강제하지 않는 표시**다.

동시성 제어(`lockRoom`, room당 advisory lock)와 `bet_actions`의 `(round_id, seq)` unique
제약은 잔액 계산과 seq 충돌만 막고 턴 순서와 무관하다.

`docs/02-data-model.md`와 `docs/04-game-engines.md`에도 서버가 턴을 강제해야 한다는 설계가
없다. 문서와 코드의 괴리가 아니라 스펙 단계부터 빠진 것이다.

### 선행 확인

`nextActorId`는 좌석 배열 인덱스 순으로 다음 사람을 찾는다. 이것이 실제 섯다·포커의 베팅
순서(선베팅자부터 시계방향)와 일치하는지 먼저 검증해야 한다. 표시용으로만 쓰였을 때는 틀려도
드러나지 않았을 수 있다.

---

## 7. 액션바 "첫 베팅 전" 오표시

> **해결 (2026-07-30)** — `action-bar.tsx`에서 콜 필요액 0을 라운드 최고 베팅액(`lastBet`)
> 기준으로 갈랐다. 0이면 `actionBar.beforeFirstBet`, 0이 아니면 내가 최고 베팅자라는 뜻이므로
> `actionBar.waitingForCall`. 표시만 고쳤고 베팅 검증은 건드리지 않았다.

이미 레이즈해서 칩이 줄어든 상태인데도 액션바에 "첫 베팅 전"이 뜬다.

### 근거

`src/features/game/components/action-bar.tsx:227-236`이 `needed > 0` 하나로 분기한다.
`needed`는 `neededToCall(betting, self.userId)`(`src/features/betting/round-bet-state.ts:33-35`),
즉 "현재 최고 베팅액 − 내가 낸 금액"이다. 이 값이 0이 되는 경우가 둘인데 코드가 구분하지 않는다.

1. 아무도 베팅하지 않음 — `betting.currentToCall === 0`
2. 내가 최고 베팅자라 상대 대응을 기다리는 중 — `needed === 0`이지만 `contribution > 0`

`contribution`은 `action-bar.tsx:99`에서 이미 계산돼 있어 분기에 바로 쓸 수 있다.

---

## 6. 모바일 가로 모드 방 화면 — 아이디어 단계

> **결정 (2026-07-30)** — 사용자가 **세로를 정본으로** 확정했다. 가로 전용 배치를 새로 만들지
> 않고, `manifest.ts`에 `orientation: 'portrait'`를 선언하고(설치된 PWA에서만 OS가 잠근다 —
> 일반 브라우저 탭에는 효과가 없다) 폰 가로에서 깨지지 않게만 대응했다.
> `globals.css`의 `@media (orientation: landscape) and (max-height: 500px)` 블록이 펠트 폭을
> `100%`로 고정해(`fit` 모드의 `h-full w-auto`+aspect-ratio가 폭을 높이에서 계산하는 탓에
> 가로에서 폭이 240px밖에 안 나오던 문제) 좌우로 퍼지게 하고 좌석 반지름을 줄인다.
> `max-height: 500px`은 폰 가로(360~430)를 포함하고 태블릿 가로(iPad mini 744↑)를 제외하려고
> 고른 값이다 — 태블릿 가로는 정상 사용 환경이라 안내를 띄우지 않는다. 전체 차단 오버레이는
> 만들지 않았다.


사용자가 다른 섯다 앱 스크린샷을 근거로 가로 전용 레이아웃을 제안했다. 참고 이미지 특징은
좌우로 퍼진 좌석 배치, 중앙에 가로로 넓은 판돈·최근 결과, 하단 리액션 버튼 바다. 참고
이미지에는 카드가 노출되지 않으며, 이 앱도 손패를 남에게 보여주지 않으므로 카드 UI를 새로
만들 필요는 없다.

### 근거

- `src/app/manifest.ts:11`이 `orientation: 'portrait'`로 세로를 고정한다. 설치된 PWA에서는 기기를 돌려도 세로로 잠긴다. 브라우저 탭으로 열면 이 제약은 걸리지 않는다.
- 방 화면 컴포넌트에 `orientation` 미디어 쿼리나 가로 분기가 없다. 폭 기준 `sm:`/`lg:` 브레이크포인트뿐이라 가로로 돌리면 좁은 세로 레이아웃이 옆으로 늘어날 뿐이다.

### 미확정

가로를 강제할지 세로도 계속 지원할지, PWA manifest를 바꿀지, 어느 화면까지 대응 범위에
넣을지. manifest는 앱 전체 단위로만 orientation을 정하므로 화면별로 다르게 하려면 방 페이지
진입 시 `screen.orientation.lock()`을 호출해야 하는데 iOS Safari 지원이 제한적이라 실기기
검증이 필요하다. 4번(세로 길이)과 같은 화면이므로 함께 설계하는 편이 낫다.

---

## 5. 섯다 레이즈 배수·상한 규칙 미구현

> **해결 (2026-07-30)** — `rooms.rulePreset` JSON에 `raiseRule`을 넣어 마이그레이션 없이
> 저장한다. 값 3개: `free`(기본값 — 미지정·기존 방 전부 이 값으로 읽혀 하위 호환),
> `ttadang`(누적 총액이 `lastBet === 0 ? baseBet : lastBet * 2`와 정확히 같아야 통과),
> `pot_limit`(누적 총액이 팟을 넘을 수 없다). 판정은 `src/features/betting/raise-rule.ts`
> 순수 함수, 강제는 `validateBetSemantics`, 선택 UI는 방 만들기 화면. 아래 미확정은 이
> 세 값으로 닫혔다 — 방 설정 페이지(`updateRoomSettings`)에서 바꾸는 경로는 아직 없다.

버그가 아니라 규칙 자체가 코드에도 문서에도 없다.

### 근거

`minimumRaiseAmount`(`src/features/betting/round-bet-state.ts:37-39`)와
`validateBetSemantics`(`src/features/betting/actions.ts:62-124`)가 강제하는 것은 **최소 레이즈
하한**(직전 콜 필요액 이상, 첫 베팅이면 `baseBet` 이상)뿐이다. 다음은 전혀 검증되지 않는다.

- **레이즈 배수.** `src/features/game/components/shared.ts:89-102`의 `ttadang: lastBet * 2`는 버튼을 누르면 그 금액을 채워주는 입력 편의 프리셋일 뿐이다. 서버는 `amount === lastBet * 2`를 강제하지 않는다. `minRaise` 이상 잔액 이하면 임의 정수가 통과한다(`actions.ts:119-123`).
- **판돈 대비 상한.** 하프·풀 프리셋도 라벨일 뿐이다.
- **절대 상한.** zod의 `amount: z.number().int().min(0).max(10_000_000)`(`actions.ts:52-58`)은 시스템 전역 방어값이지 판돈 연동 상한이 아니다.
- 방 생성 시 저장되는 `rulePreset`(`src/features/game/actions.ts:58-62`, `fair-play-settings.ts:4-11`)에 관련 필드가 없다.

### 미확정

어떤 규칙을 원하는지 확정이 필요하다. 후보는 따당 강제(재레이즈를 직전 베팅의 정배수로 제한),
pot-limit(레이즈를 현재 판돈 이하로 제한), 방 생성 시 하우스 룰로 선택(강제 없음 유지 포함).

---

## 4. 방 화면 모바일 세로 길이

> **해결 (2026-07-30)** — 모바일도 뷰포트 고정으로 바꿨다. 딜러 컨트롤은 하단 시트
> (`dealer-tools-sheet.tsx`)로 빼고, 자주 쓰는 판 시작·종료·무효와 승인 대기 배지만
> 액션바 위 컴팩트 줄(`dealer-quick-bar.tsx`)에 남겼다. `GameTable`의 `fit` 모드가
> `--action-bar-h`를 뺀 남는 높이에 맞춰 줄어든다. 진행 기록은 테이블 위 아이콘으로 여는
> 시트로 옮겼다. 아래 미확정은 "바텀시트로 뺀다"로 닫혔다 — 승인 큐·되돌리기 목록은 높이를
> 예측할 수 없어 고정 영역에 담을 수 없다는 실측이 근거다. **실기기 확인은 남아 있다.**

딜러 컨트롤의 판 종료·판 무효 버튼이 하단 고정 액션바에 가려 스크롤해야 보인다.
데스크톱(`lg` 이상)은 2026-07-30에 뷰포트 고정으로 바꿨다 — `main`이 `lg:min-h-0 lg:flex-1
lg:overflow-hidden`이고, 좌측 컬럼의 `GameTable`이 `fit` 모드로 남은 높이에 맞게 줄어들며,
우측 컬럼(딜러 패널 + 진행 기록)만 자기 영역 안에서 스크롤한다. **모바일은 그대로다.**

### 근거

`src/features/game/components/room-client.tsx`에서 모바일(`lg` 미만)은 grid가 적용되지 않아
모든 섹션이 세로로 쌓인다. `FairnessPanel` → 지난 판 요약 → `GameTable` → `ActionBar` →
`DealerPanel` → `RoundLog` 순이다.

- `GameTable` 컨테이너가 `aspect-[4/5] sm:aspect-[16/10]`(7명 이상은 `aspect-[5/7] sm:aspect-square`)로 고정이다. 인원수와 무관하므로 2인방도 세로 공간을 다 쓴다.
- `DealerPanel`은 데스크톱에서 우측 컬럼으로 빠지지만 모바일에서는 아래로 계속 쌓인다.
- `ActionBar`는 모바일에서 `fixed inset-x-0 bottom-0`이다. `main`의 `pb-[calc(var(--action-bar-h,0px)+1.5rem)]`은 스크롤 끝에서 마지막 콘텐츠가 안 가려지게 하는 용도일 뿐이다. 딜러 겸 방장 계정은 `DealerPanel`과 `ActionBar`가 둘 다 떠서 세로 길이가 특히 길어진다.

방 최대 인원은 10명이다(`src/features/game/actions.ts:235`, 미지정 시 기본값도 10 —
`action-helpers.ts:68-71`). `GameTable`은 7명 이상이면 `compact`로 좌석을 줄인다
(`game-table.tsx:65`). 개선 시 2명과 10명 양쪽을 확인해야 한다.

### 미확정

인원수에 따라 테이블 비율을 좁힐지, 딜러 패널만 바텀시트·드로어로 뺄지. 사용자가 아직
확정하지 않았다. 데스크톱에 쓴 방식(테이블을 남은 높이에 맞게 축소 + 부수 패널만 내부
스크롤)을 모바일에 그대로 적용하면 액션바 위에 남는 높이가 2인방 기준 약 240px이라
`DealerPanel`의 승인 큐·되돌리기 목록이 들어가지 않는다. 그래서 모바일은 바텀시트 여부를
정해야 진행할 수 있다.

---

## 17. 누적 비용 — 안전정수 트리거와 랭킹 집계

둘 다 지금 결함은 아니고 **실측 없이는 고칠 근거가 없는** 용량 계획 항목이다.

- `drizzle/migrations/0017_bored_brood.sql`의 `assert_user_chip_activity_number_safe()`는
  `chip_ledger`·`buy_ins` INSERT마다 해당 사용자·해당 방의 전체 이력을 `SUM(abs(...))`로 다시
  집계한다. 인덱스(`chip_ledger_user_idx`, `buy_ins_user_idx`)가 있어 풀스캔은 아니지만
  누적 활동량에 비례해 매 베팅·바이인 비용이 는다. 캡·아카이빙 정책이 없다.
- `src/features/ranking/queries.ts`의 `getCumulativeRanking`은 `/ranking` 방문마다
  `settled`/`closed` 모든 방의 `chip_ledger`·`buy_ins`·`rounds`·`room_members`를 전량 집계한다.
  캐시·기본 시간 범위 제한이 없다(`filter.since`는 옵션).

### 미확정

실사용 규모(MT·모임 단위)에서 임계치에 도달하는지. 도달한다면 사용자별 누적 카운터 컬럼,
랭킹 스냅샷/머티리얼라이즈드 뷰가 후보다. [`docs/02-data-model.md`](02-data-model.md)의
"방 보존 기간·아카이빙 정책 미정"과 같은 뿌리다.

---

## 16. `undoLastBuyIn`의 레거시 원장 매칭 휴리스틱

`src/features/budget/actions.ts`가 되돌릴 원장 행을 찾을 때 `refBuyInId = lastBuyIn.id OR
refBuyInId IS NULL`로 매칭한다. `refBuyInId`가 없는 레거시 행이 같은 사용자에게 같은 금액으로
여럿 있으면, 정렬(`refBuyInId is not null desc, createdAt desc`)이 최근 것을 고르더라도 실제
되돌리려는 바이인과 무관한 행을 `revertedOf`로 연결할 수 있다.

칩 잔액은 `-lastBuyIn.amount`로 정확히 차감되므로 **자금은 안전하고 감사 사슬만 어긋난다.**
대상 데이터는 `0009_perfect_molly_hayes.sql` 백필 범위뿐이다.

### 미확정

운영 DB에 `refBuyInId IS NULL`인 `buy_in` 원장 행이 실제로 남아 있는지. 없으면 폴백 분기를
지우면 끝이고, 있으면 백필 후 지운다. DB 접속 없이는 확인 불가.

---

## 15. `credit-room.ts`·`wallet/ledger.ts`가 배선되지 않은 검증 로직

`src/features/game/credit-room.ts`의 `createRoomCreditLockCommand`/`createRoomCreditSettlementCommand`와
`src/features/wallet/ledger.ts`의 `adminAdjustmentEntries`/`validateCreditEntries`는 팟 보존·계정당
1엔트리 같은 불변식 검사를 갖춘 순수 함수인데, **각자의 테스트 파일에서만 참조된다.**

실제 경로(`features/game/actions.ts`, `features/budget/actions.ts`, `features/wallet/actions.ts`,
`features/auth/admin-actions.ts`)는 전부 `tx.execute(sql\`select public.lock_room_credit_buy_in(...)\`)`
형태로 Postgres RPC를 직접 부르고 이 모듈을 거치지 않는다. 정합성은
`supabase/migrations/0009~0013`의 SQL 함수가 담당하므로 **자금 안전에는 문제가 없다.**

문제는 함정이다 — "테스트로 보장된 검증 로직"처럼 보여서 나중에 여기만 고치면 프로덕션 동작은
그대로다.

### 미확정

원래 의도한 구조(TS가 커맨드를 만들고 SQL은 posting만)를 되살릴지, SQL RPC 중심으로 확정하고
이 모듈과 테스트를 지울지.

---

## 14. 게임플레이 Server Action에 rate limit 부재

`consumeRateLimits`를 쓰는 곳은 `features/auth/actions.ts`, `profile-actions.ts`,
`jokbo-advisor/vision/actions.ts`, `lib/auth.ts`뿐이다. `createRoom`·`joinRoom`·`addBuyIn`·
`addLocalMember`·`placeBet`에는 없다.

- `createRoom` 반복 호출은 `rooms`/`room_members`/`buy_ins`/`chip_ledger` 행을 무제한 만든다.
- `addLocalMember`는 **호출마다 `users` 행**(`is_managed=true`)을 만든다 — 가장 값싼 남용 경로다.
- `placeBet`은 방 단위 `pg_advisory_xact_lock`으로 직렬화되므로 행 증식 문제는 없다.

### 판단

생성 경로(방·로컬 멤버·입장)만 조인다. **`placeBet`에는 붙이지 않는다** — 이미 직렬화돼 있고,
한도를 잘못 잡으면 빠른 판에서 정상 베팅이 막힌다. 잘못된 rate limit은 남용보다 게임을 더 크게
망친다.

---

## 13. SSO 자동 병합 — 해결됨, 대체 흐름이 없다

> **해결 (2026-07-30)** — 감사에서 계정 탈취 경로로 확인돼 즉시 막았다. `src/lib/auth.ts`가
> `preferred_username`·`phone_number` **미검증 클레임**으로 내부 계정을 찾아 그 계정의
> `authentikSub`를 덮어썼고, 조건에 `authentikSub IS NULL`이 없어 **이미 다른 sub에 연결된
> 계정까지** 가져갈 수 있었다. 이제 `preferred_username`은 쓰지 않고, 전화번호는
> `phone_number_verified === true`일 때만, 미연결 계정 하나와만 일치할 때 연결하며,
> 연결 사실을 `console.warn`으로 남긴다. 정본 문서
> [`docs/07-auth-and-security.md`](07-auth-and-security.md)도 함께 갱신했다.

### 남은 일

아이디 기반 자동 연결이 없어졌으므로, 내부 계정으로 가입한 사람이 SSO로 들어오면 전화번호가
검증돼 있지 않은 한 **새 계정**이 생긴다. 제대로 하려면 "로그인한 상태에서 SSO 계정 연결하기"
흐름이 필요하다 — 세션 주체가 확실한 상태에서 연결하므로 클레임을 신뢰할 필요가 없다.

### 미확정

Authentik이 `phone_number_verified`를 실제로 발급하는지. 발급하지 않으면 자동 연결은 사실상
꺼진 상태이고, 위 "연결하기" 흐름이 유일한 경로가 된다.

---

## 확인했지만 문제 없던 것 (같은 곳을 다시 파지 않도록)

2026-07-30 감사 기준.

- **트랜잭션·잠금**: 방/판/베팅 액션 전부 `pg_advisory_xact_lock(hashtextextended(roomId, 42))`로
  방 단위 직렬화 후 트랜잭션 안에서 잔액을 재조회한다. 두 딜러의 동시 승인, 수동 `endRound`와
  자동 종료(`autoSettleRoundIfComplete`)의 경쟁 모두 같은 락으로 직렬화돼 이중 정산이 불가능하다.
- **멱등성**: `bet_actions.id`는 클라이언트 UUID로 재삽입 시 기존 행을 반환. credit RPC는
  `idempotency_key` UNIQUE + 조회-후-반환.
- **원장 불변성**: `chip_ledger`·`credit_transactions`·`credit_entries`·`round_fairness_reveals`가
  `BEFORE UPDATE OR DELETE` 트리거로 `kkeutbal_app`(bypassrls)의 실수까지 차단한다.
- **권한**: 모든 액션이 `currentUserId()`(세션)로 주체를 얻는다 — 클라이언트가 보낸 id를 신뢰하는
  경로는 발견되지 않았다. 관리자 액션은 전부 `isAdminUser` 재검증.
- **공정 딜 시드**: `serverSeedCiphertext`는 생성·서버 내부 복호화 경로에만 있고 클라이언트
  스냅샷·공개 영수증에 포함되지 않는다. `getMyVerifiedSeotdaHand`는 요청자 본인 카드만 반환.
- **비밀값**: `process.env` 직접 읽기는 `layout.tsx`의 공개 값과 `env.ts` 자체뿐.
- **RLS**: `supabase/migrations`의 grant·정책이 문서와 일치 — `anon`/`authenticated`는 권한 없음.

### 재확인할 가치가 있는 설계 (버그는 아님)

`/rooms/[code]/result`와 `refreshRoom`은 방 멤버십을 보지 않고 로그인 여부만 본다 —
[`docs/07-auth-and-security.md`](07-auth-and-security.md)의 권한표에 "로그인 사용자 전광판 조회
허용"으로 명시된 의도된 설계다. 다만 **방 UUID를 아는 로그인 사용자 누구나**(게스트 포함) 그 방의
잔액·정산 내역을 볼 수 있다는 뜻이라, 배포 전에 이 범위가 맞는지 한 번 더 확인할 가치가 있다.

---

## 12. 실시간 통신 안정성 — 코드 근거

> **해결 (2026-07-30)** — 아래 여섯 항목 중 앞의 다섯 개를 고쳤다. 재구독은
> `CHANNEL_ERROR`·`TIMED_OUT`·`CLOSED` 전부에서 걸리고 백오프에 equal jitter가 들어갔다
> (`src/lib/realtime/reconnect-backoff.ts`, 최대 10회 뒤에는 `visibilitychange`/`online`과
> 수동 버튼이 회복 경로). `refetch`는 8초 상한(`sync-timeouts.ts`, action race 15초와 한 파일에
> 두어 관계를 못 잃게 했다). 전송은 3회 재시도 후 실패를 `room.broadcastDelayed`로 알린다.
> envelope `id`는 FIFO 200개 집합(`seen-events.ts`)으로 dedup하되 피드백만 건너뛰고 스냅샷
> refetch는 그대로 돈다. **`broadcast.ack`를 켰다** — 없으면 조인된 채널에서 `send()`가 서버
> 확인 없이 즉시 성공으로 떨어져 재시도가 무의미했다(정본은
> [`docs/03-realtime-protocol.md`](03-realtime-protocol.md)에 함께 갱신).
> 마지막 항목(모든 broadcast가 전체 스냅샷 refetch를 유발)도 처리했다 — refetch를 없앤 게
> 아니라 트리거를 줄였다. `event-sync-policy.ts`가 이벤트를 immediate(`round.*`)/passive(`bet.*`,
> `afterMutation`이 항상 `state.snapshot`을 동반 발신하므로 트리거를 넘긴다)/coalesced로 나누고,
> `state-snapshot-hint.ts`가 서버가 계산해 보낸 팟·잔액만 낙관적으로 먼저 반영한다
> (`room.status`는 절대 반영하지 않는다 — 공개 채널 payload로 리다이렉트를 트리거하면 안 된다).
> presence는 모르는 id가 나타날 때만 refetch한다. **그 과정에서 starvation 버그를 찾았다**:
> `Math.max(250, 1000 - sinceLast)` 계산은 refetch가 한 번도 안 돈 상태에서 이벤트가 250ms보다
> 촘촘히 들어오면 타이머를 영원히 재무장해 refetch가 아예 안 돌았다 — 10인방 동시 베팅이 정확히
> 그 경우다. 부하가 가장 심할 때 동기화가 멈추는 구조였다. 숫자는 하나도 바꾸지 않았다(실측 없음).

`docs/03-realtime-protocol.md`가 프로토콜 정본이고, 이 절은 현재 구현에서 확인된 빈 곳만 적는다.

- **재구독이 `CLOSED`에서만 걸린다** — `use-room-sync.ts`의 `channel.subscribe` 콜백은
  `CHANNEL_ERROR`·`TIMED_OUT`에서 `setConnectedBoth(false)`만 하고 백오프 타이머를 예약하지 않는다.
  그 상태로 멈추면 `visibilitychange`·`online`이 올 때까지 끊긴 채 앉아 있는다.
- **백오프에 지터가 없다** — `RETRY_DELAYS_MS`가 고정 배열이라 10인방이 같이 끊기면 같은 시각에
  같이 재접속한다.
- **`refreshRoom`에 상한이 없다** — `runAction`(`room-client.tsx`)은 15초 레이스를 걸지만
  폴링·이벤트 유래 `refetch`는 무기한 대기한다. `src/lib/with-timeout.ts`가 이미 있다.
- **broadcast 전송이 fire-and-forget** — `client.ts`의 `sendRoomEvent`는 `void channel.send(...)`,
  `sendOneShotRoomEvent`는 빈 `catch`다. 소켓이 끊긴 상태면 이벤트가 조용히 사라지고 다른 참가자는
  20초 폴링까지 기다린다.
- **envelope `id`를 쓰지 않는다** — 재접속 시 같은 이벤트가 두 번 배달되면 소리·토스트가 두 번 난다.
  진실은 스냅샷이라 상태는 안 깨지지만 피드백이 중복된다.
- **모든 broadcast가 전체 스냅샷 refetch를 유발한다** — 이벤트당 `debouncedRefetch()`(250ms 디바운스,
  이벤트 유래 최소 1초 간격). 10명이 빠르게 베팅하면 방 전체로 초당 수 회 왕복이 된다.

---

## 11. 고정 뷰포트 레이아웃 규약

2026-07-30부터 목록·조회 화면은 **문서 스크롤을 만들지 않는다**. 넘치는 내용은 페이지를
늘리는 대신 (a) 뷰포트에 들어가는 줄 수만 그리고 나머지를 페이지로 넘기거나, (b) 명시적으로
경계가 있는 내부 스크롤 영역에 담는다.

### 구성 요소

| 요소 | 위치 | 역할 |
| --- | --- | --- |
| `FixedPage` / `FixedBody` / `ScrollPane` | `src/components/ui/page-shell.tsx` | 남은 높이를 정확히 차지하는 `main`, 그 안의 신축 영역, 스크롤이 허용되는 유일한 지점 |
| `useFitCount` / `usePagedRows` / `Pager` | `src/components/ui/paged.tsx` | 영역 높이 ÷ 줄 높이로 페이지 크기를 정하고, 검색·필터가 바뀌면 1페이지로 되돌린다 |
| `DataTable` | `src/components/ui/data-table.tsx` | 데스크톱 표. 줄 높이 `DATA_TABLE_ROW_H`, 머리글 높이 `DATA_TABLE_HEADER_H`가 페이지 계산과 짝을 이룬다 |
| `PaneGroup` | `src/components/ui/pane-group.tsx` | 데스크톱은 패널 나란히, 모바일은 탭으로 하나씩 |

`body`가 `display: flex; flex-direction: column; min-height: 100dvh`인 셸이고 `FixedPage`가
`flex-1 min-h-0`이다. 그래서 프로모션 배너(`PromotionHost`의 `aside`)가 위에 붙어도 고정
페이지 높이가 어긋나지 않는다. `h-dvh`로 되돌리면 배너가 뜬 순간 문서 스크롤이 되살아난다.

### 적용 여부

- 적용: `/`, `/admin`, `/ranking`, `/ranking/player/[id]`, `/wallet`, `/advisor`, `/rooms/new`, `/rooms/[code]`, `/rooms/[code]/result`, `/rooms/[code]/monitor`
- 미적용(의도): `/guide/*`, `/about` — 읽는 문서라서 문서 스크롤이 맞다
- **"한 패널 화면은 예외"가 아니다** (2026-07-30 교정): 우선 불변식은 "문서 스크롤 없음"이고
  `flex-1` 중앙 정렬은 그걸 지키는 한에서의 기본 선택지다. e2e(`e2e/fixed-viewport.spec.ts`)가
  `/login`에서 이 예외를 근거로 스크롤을 허용하지 않고 실제로 실패시켰다 — Pixel 7에서 넘쳤다.
  필드가 많아 고정 뷰포트에 안 들어가는 화면(5필드 가입 폼)은 `FixedPage`+`ScrollPane`으로
  전환해 내부 스크롤로 흡수한다

### 줄 높이를 바꿀 때

모바일 카드 줄 높이는 각 화면 파일 상단의 `ROW_H` 상수이고 실제 마크업(`h-16` + `space-y-2`)과
짝을 맞춰야 한다. 한쪽만 바꾸면 페이지당 줄 수가 틀려서 마지막 줄이 잘리거나 빈 공간이 남는다.

---

## 3. 계정 설정 페이지 없음

> **해결 (2026-07-30)** — `/account` 라우트와 `updateDisplayName` Server Action을 넣었다.
> **표시 이름만** 바꾼다. 전화번호는 본인 인증 없이 열면 계정 탈취 경로가 되므로 제외했고,
> 아바타도 범위 밖이다(아래 미확정은 이 결정으로 닫혔다). 게스트는 이름이 입장 토큰에 묶여
> 있어 서버·화면 양쪽에서 차단하고 이유를 보여준다. 이름 규칙은 회원가입과 같은
> `displayNameSchema` 하나를 공유한다. 이름 스냅샷 컬럼이 없어(전부 `userId` FK 조인)
> 랭킹·과거 판 기록까지 다음 조회에 새 이름이 반영된다.

`displayName`은 회원가입 또는 SSO·게스트 최초 로그인 시 한 번 정해지고 이후 본인이 바꿀
UI가 없다. `/settings`, `/profile` 같은 라우트가 `src/app` 하위에 존재하지 않는다.

### 관련 스키마 — `drizzle/schema.ts`의 `users`

- `displayName` (not null) — 요청의 핵심. 랭킹·방 표시 등 여러 곳에서 참조된다.
- `username` (unique, `local:` 계정만) — 로그인 ID. `local:{username}` 형태로 `authentikSub`을 참조하는 코드가 있는지 확인해야 하며, 불변으로 두는 편이 안전하다.
- `avatarUrl` (nullable) — 현재 설정하는 UI가 없다.
- `phone` (unique) — 가입 시 필수값.

### 미확정

닉네임만 바꿀지 아바타·전화번호까지 포함할지. 전화번호는 본인 인증 없이 바꾸면 계정 탈취
경로가 되므로 별도 검토가 필요하다.

게스트 계정은 토큰과 이름 조합으로 `authentikSub`이 고정되는 구조라
([`docs/07-auth-and-security.md`](07-auth-and-security.md)) `displayName`을 나중에 바꾸면
`authentikSub`과 어긋난다. 제외하거나 별도 처리가 필요하다.

---

## 2. 족보 판독 — 포커 설명과 부분 선택 미리보기

> **해결 (2026-07-30)** — 포커 10단계에 카테고리별 설명을 붙였고(`poker-rank-table.ts`의
> `descriptionKey`), 3~4장 선택 시 남은 덱 기준 확률을 `poker-preview.ts`(순수 함수 +
> `poker-preview.test.ts` 6개)로 계산한다. 1~2장은 계산하지 않고, 상한
> `POKER_PREVIEW_MAX_COMBINATIONS = 2000`을 넘으면 계산을 생략하고 그 사실을 화면에 밝힌다.
> 아래 실측표가 그 상한의 근거다.

### 포커 족보 설명

`POKER_RANK_TABLE`(`src/features/jokbo-advisor/components/poker-rank-table.ts`)이 `label`만
갖는다. 섯다 쪽은 이미 `SEOTDA_RANK_TABLE`의 `detail` 필드와 `SeotdaRankDetail` 유니온으로
대표 조합을 표시한다(`seotda-rank-table.ts`). 포커는 카테고리가 고정 10단계라 정적 문자열
매핑으로 충분하고 계산 로직이 필요 없다.

### 부분 선택 미리보기 — 계산량 실측

**섯다**: 2장 중 1장만 고른 상태에서 남은 덱은 19장. 19가지를 전부 `evaluateSeotdaHand`로
평가해도 계산량이 미미하다. `stats.ts`의 `seotdaStats`가 이미 비슷한 규모를 순회한다.

**포커**: 보유 카드 수별로 남은 덱에서 뽑을 조합 수를 Node에서 실측했다.

| 보유 | 필요 | 조합 수 | `evaluatePokerHand` 순회 |
| --- | --- | --- | --- |
| 1장 | 4장 | 249,900 | 약 520ms |
| 2장 | 3장 | 19,600 | 약 49ms |
| 3장 | 2장 | 1,176 | 약 5ms |
| 4장 | 1장 | 48 | 무시 가능 |
| 5장 | 0장 | 1 | 기존 `PokerResult`가 처리 |

브라우저 메인 스레드는 이보다 느리다. **합의된 방향: 3장 이상일 때만 실시간 계산하고
1~2장은 기존 "카드 N장 더 선택" 문구를 유지한다.** 3장부터는 최대 1,176 조합이라 클릭마다
돌려도 무리가 없고 웹워커 같은 최적화가 필요 없다.

UI 표시 형태(카테고리별 막대, 퍼센트 리스트 등)는 미정이다.

---

## 참고 — 로컬 개발 환경

다른 머신에서도 겪을 수 있어 남긴다.

- 전역 `pnpm`이 corepack shim으로 깨지는 경우가 있다(`ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`). `~/.nvm/versions/node/<ver>/bin/pnpm`을 지우고 `npm install -g pnpm@11.15.1`로 재설치하면 해결된다.
- `package.json`의 `pnpm@11.15.1`은 Node 22.13 이상을 요구한다. `.nvmrc`는 `22`로 고정돼 있다.
