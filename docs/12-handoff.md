# 12. 인수인계 — 조사 기록

| Field | Value |
|-------|-------|
| Type | technical-design |
| Audience | engineering |
| Status | active |
| Source of truth | 조사 근거와 미확정 설계 질문은 이 문서. 실행 항목과 완료 기준은 [`TODO.md`](../TODO.md) |
| Last reviewed | 2026-07-29 |

세션이 바뀌어도 조사 결과가 날아가지 않게 누적하는 문서다. 각 섹션은 **무엇이 잘못됐고
어디가 근거인지**, 그리고 **사용자가 정해줘야 구현이 시작되는 것**만 담는다. 구현 순서와
완료 기준은 `TODO.md`가 소유하므로 여기 옮겨 적지 않는다.

섹션 번호는 `TODO.md`가 참조하므로 재사용하지 않는다. 배포까지 반영된 항목은 삭제한다.

---

## 10. 방 화면에서 족보 판독으로 가는 진입점 없음

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

딜러 컨트롤의 판 종료·판 무효 버튼이 하단 고정 액션바에 가려 스크롤해야 보인다.

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
확정하지 않았다.

---

## 3. 계정 설정 페이지 없음

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
