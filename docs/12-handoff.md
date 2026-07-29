# 12. 인수인계 (Handoff)

이 문서는 하나로 누적되는 인수인계 로그다. 사용자가 코드를 직접 커밋/push하지 않으므로,
작업이 끝날 때마다 여기에 새 섹션을 위에서부터 추가한다(최신이 위). **완료되어 배포까지
반영된 항목은 이 문서에서 삭제한다** — 여기 남아있는 섹션은 전부 미구현/진행 중인 작업이다.

---

## 10. 방(room) 화면에서 족보 판독으로 바로 가는 진입점 없음 — 미구현

**상태**: 조사 완료, 미구현 확인. 코드 변경 없음.

### 요청

방(테이블) 화면에서 베팅 중에 바로 족보 판독(`/advisor`)으로 넘어가거나, 방 안에서 족보를 확인할 수 있는 파이프라인이 있어야 할 것 같다는 요청.

### 현재 상태 — 완전히 분리된 두 화면, 연결 없음

- `/advisor`로 가는 링크는 프로젝트 전체에서 홈 화면(`src/app/(home)/page.tsx:129` `<Link href="/advisor">`) 단 한 곳뿐. `src/features/game/`(방 관련 컴포넌트) 어디에도 `/advisor`를 참조하는 코드가 없음.
- 방 헤더(`src/features/game/components/room-header.tsx:63-90`)에는 이미 결과(`/rooms/{code}/result`), 모니터(`/rooms/{code}/monitor`), 설정(`/rooms/{code}/settings`) 세 개의 아이콘 버튼이 있음(스크린샷에서 본 영수증/모니터/톱니 아이콘) — 족보 판독으로 가는 네 번째 아이콘은 없음.
- `/advisor` 페이지(`src/app/advisor/page.tsx`)와 `AdvisorClient`(`src/features/jokbo-advisor/components/advisor-client.tsx`)는 `searchParams`나 다른 방식으로 외부에서 초기 카드 상태를 받는 기능이 전혀 없음 — 완전히 독립된 화면이라, 방에서 이동해도 카드를 처음부터 다시 선택해야 함.

### 다음 사람이 할 일 (설계 필요, 확정 안 됨)

1. **최소 버전**: `room-header.tsx`의 기존 아이콘 버튼 패턴(`ButtonLink`, :63-90)을 따라 "족보 판독" 진입점 하나 추가 — `/advisor`로 그냥 이동만 시켜도 사용자 요청의 "파이프라인" 절반은 충족됨. 방 코드를 쿼리 파라미터로 넘겨서 나중에 돌아올 때 참고하게 할 수도 있음(예: `/advisor?from=/rooms/{code}`).
2. **더 나은 버전(선택)**: 현재 라운드에서 자신이 쥔 카드 정보가 있다면(이 앱이 실제로 카드를 추적하는지 확인 필요 — `docs/07-auth-and-security.md`/`docs/04-game-engines.md` 참고, 공정 딜(`fairness`) 기능이 있는 방이면 서버가 카드를 알 수도 있음) 그 카드를 `/advisor`로 미리 채워서 넘겨주는 딥링크. 다만 이 앱은 기본적으로 참가자가 실물 화투를 보고 직접 입력하는 구조라(카드 자동 인식은 사진 업로드 vision 기능뿐, `jokbo-advisor/vision/`), 서버가 이미 알고 있는 카드를 자동으로 채워주는 게 설계상 맞는지부터 확인 필요 — 공정 딜 신뢰 모델(`docs/10-virtual-credit-and-fair-play.md`)과 충돌하지 않는지 점검할 것.
3. 아이콘 추가 시 i18n 키(`ko.ts`/`en.ts`) 추가 필요.
4. 모바일에서 아이콘 4개 이상이 될 때 헤더 레이아웃이 어떻게 될지 확인 필요 — 4번 항목(방 화면 모바일 레이아웃이 세로로 길어지는 문제)과 함께 검토하면 좋음.

---

## 9. 판 자동 종료 — (a) 전원 콜 완료, (b) 전원 다이(1명만 남음) — 미구현, 8번과 강하게 연관

**상태**: 조사 완료, 미구현 확인. 코드 변경 없음. **8번(턴 검증 부재)을 먼저 고치지 않으면 이 기능도 제대로 동작할 수 없음** — 순서상 8번이 선행되어야 함.

이 섹션은 트리거 조건이 다른 두 가지 자동 종료 요청을 묶는다: (a) 다이(fold) 안 한 나머지 전원이 콜해서 베팅이 끝난 경우, (b) 한 명 빼고 전원 다이해서 자동으로 승자가 정해지는 경우. 둘 다 "판을 자동으로 끝내야 한다"는 점은 같지만, (b)는 승자가 이미 명확(마지막 생존자)해서 쇼다운 없이 바로 정산까지 자동화할 여지가 있다는 점이 (a)와 다르다 — 아래에서 구분해서 정리.

### (b) 전원 다이 시 자동 종료 — 추가 확인 사항

`src/features/betting/actions.ts`에서 fold 액션은 그냥 `bet_actions`에 기록만 되고(`actions.ts:106` `if (action === 'fold') return null` — 검증만 통과시킬 뿐), **"non-fold 참가자가 1명만 남았다"를 감지해서 자동으로 판을 끝내는 코드는 없음** — (a)와 동일하게 `endRound`(`round-actions.ts:159`)를 딜러가 수동으로 눌러야만 끝남. 다만 (b)는 승자가 마지막 생존자로 자동 확정되므로, 딜러가 "승자 선택" 단계(`dealer-panel.tsx`의 `pickWinner` 모드)를 거칠 필요 없이 바로 확정해도 되는 케이스 — 이 경우는 (a)보다 자동화가 더 안전하고 쉬움(카드 판정 없이 "마지막 한 명이 승자"라는 규칙만 있으면 됨).

### 요청 내용 — 용어 정리 먼저 필요

사용자 요청: "유저 사이클이 한 바�퀴 돌고, 섯다/포커 규칙에 턴이 전부 끝났으면(다이 하지 않은 나머지 인원 모두 콜) 다음 세션으로 넘어가야 한다. 세션 구분도 명확해야 한다."

**중요 — 용어 충돌 확인됨**: 이 코드베이스에서 "세션"은 이미 정착된 용어이고, room(방) 하나를 가리킨다(`docs/02-data-model.md`의 뷰 `session_standings(room_id)`, `src/features/game/queries.ts`의 `getMyRecentSessions()`, `src/features/ranking/queries.ts`의 `getSessionStandings(roomId)`, 딜러 패널의 "🧾 세션 정산" 버튼은 실제로 `closeRoom(roomId)`를 호출함). 즉 기존 의미의 "세션"은 "방 하나 = 그 방에서 열린 모든 판(rounds) 전체"다.

사용자가 말한 "다음 세션으로 넘어간다"는 문맥상(베팅 한 바퀴 끝난 직후) **기존 용어의 "세션"이 아니라 "다음 판(round)" 또는 "다음 단계(쇼다운/정산)"를 뜻하는 것으로 보임.** 다음 사람은 구현 전에 **사용자와 용어부터 재확인할 것** — "판(round)이 끝나고 다음 판으로 자동 전환"을 원하는 건지, 아니면 정말 새로운 상위 개념(현재 room 하나를 여러 "세션"으로 쪼개는 것)을 원하는 건지 헷갈리지 않게 짚어야 함.

### 현재 구현 상태 — 전부 딜러 수동 트리거, 자동 판정 없음

- `src/features/betting/actions.ts`의 `placeBet`/`approveBet`는 베팅 금액 검증만 하고 끝남 — "모든 non-fold 참가자의 누적 베팅액이 같아졌다(=베팅 라운드 종료)"를 감지해서 뭔가를 트리거하는 코드가 전혀 없음.
- `src/features/game/round-actions.ts:159` `endRound`는 딜러/호스트가 "🏁 종료" 버튼(`src/features/game/components/dealer-panel.tsx:174-207`)을 수동으로 눌러야만 호출됨. 내부에 "pending 베팅이 남아있으면 막는다"는 정도만 있고, "전원 콜 완료 여부"를 확인하지 않음.
- `startRound`(`round-actions.ts:39-138`)도 딜러가 "▶ 라운드 시작" 버튼을 눌러야 새 판이 시작됨.
- **DB 스키마 자체에 "베팅 라운드/스트리트" 개념이 없음** — `drizzle/schema.ts`의 `rounds` 테이블엔 `status`(`playing`/`ended`/`voided`)만 있고 street/phase 컬럼이 없음. `bet_actions`도 `roundId` 안에서 그냥 순차 `seq`만 있어서, 한 판(round) 안 베팅은 구조적으로 "단일 연속 시퀀스"임 — 포커의 프리플랍/플랍/턴/리버 같은 다중 스트리트 개념 자체가 스키마에 없음. 이건 섯다가 원래 단일 벳 라운드(패 받고 베팅 한 바퀴, 쇼다운) 구조라 지금까지는 문제 안 됐을 수 있지만, 포커에 적용하려면 스키마부터 확장 필요할 수 있음.
- `docs/04-game-engines.md`의 "엔진 계약(공통 인터페이스 — 미구현)" 섹션이 이걸 그대로 확인해줌: "`features/game/`은 판 종료 시 어떤 엔진도 호출하지 않는다 — 승자 지정은 딜러가 수동으로 한다(`endRound`)". 즉 이 문서 자체가 "자동 전환은 아직 없다"고 이미 밝혀둔 상태.

### 8번(턴 검증 부재)과의 관계 — 순서 중요

"전원 콜 완료 시 자동 전환"을 판정하려면 먼저 "누가 이미 액션했고 누가 아직 안 했는지"를 정확히 추적해야 하는데, 지금은 서버에 턴 순서 개념 자체가 없어서(8번 참고) 아무나 순서 무관하게 베팅을 넣을 수 있는 상태다. 이 상태에서 "한 바퀴 돌았다"를 판정하는 로직을 먼저 만들면, 8번 버그 때문에 판정 자체가 부정확해질 수 있다(예: 같은 사람이 여러 번 베팅해서 "한 바퀴"의 기준이 애매해짐). **8번(서버 턴 검증)을 먼저 구현하고, 그 위에 "베팅 라운드 종료 판정"을 얹는 순서를 권장.**

### 다음 사람이 할 일

1. 위 "용어 정리" 항목을 사용자와 먼저 확인 — "세션"이 판(round) 전환을 뜻하는지, 진짜 room 안의 새 상위 단위를 뜻하는지.
2. 8번 항목(서버 턴 검증)부터 구현.
3. (a) "베팅 라운드 종료" 판정 로직 설계: fold하지 않은 참가자 전원의 `contributionByUser`(`round-bet-state.ts`)가 서로 같아졌고, 마지막 액션 이후로 아무도 레이즈하지 않았다면 종료로 판정 — 텍사스홀덤류에서 흔히 쓰는 "모두가 콜했거나 체크했다" 조건과 동일한 개념.
4. (b) "전원 다이" 판정 로직 설계: fold하지 않은 참가자가 정확히 1명 남으면 즉시 종료 — 이건 (a)보다 단순하고, 카드 판정 없이 마지막 생존자를 자동으로 승자 확정할 수 있음.
5. 종료 판정 이후 무엇을 자동으로 할지 확정 필요: (a-1) 콜 완료 케이스는 섯다/현재 구조라면 바로 쇼다운(승자 판정) 단계로 넘어가되 승자 지정은 여전히 딜러 수동으로 둘지, 완전 자동화(엔진이 카드로 승자까지 판정)할지 — 후자는 `docs/04-game-engines.md`가 명시한 "판 종료 시 엔진 미호출" 설계 자체를 바꾸는 큰 변경이라 별도 논의 필요. (b) 전원 다이 케이스는 카드 판정이 필요 없으니 딜러 확인 없이 완전 자동 정산까지 가는 것도 상대적으로 안전한 선택지.
6. 포커에 여러 스트리트(플랍/턴/리버)를 도입하려면 `rounds`/`bet_actions` 스키마에 phase 개념 추가가 선행되어야 함 — 지금 스키마는 단일 벳 라운드 전제로 짜여 있음.
6. 자동 전환 관련 realtime 이벤트(`docs/03-realtime-protocol.md`)도 새로 정의 필요할 수 있음 — 현재는 `round.started`/`round.ended`/`round.voided`뿐, "베팅 라운드 종료" 이벤트가 없음.

---

## 8. 베팅 턴(차례) 검증 부재 — 실제 버그 확인, 미수정 (7번과 연관)

**상태**: 서버 코드 조사로 재현 가능한 버그임을 확인. 코드 변경 없음. 7번(액션바 "첫 베팅 전" 오표시) 조사 중 참고로 남겼던 "액션바가 내 차례 여부와 무관하게 항상 조작 가능해 보인다"는 의심이 실제 버그였음.

### 신고 내용

한 사람이 연속으로(자기 차례가 아닌데도, 또는 남의 차례를 건너뛰고) 베팅 가능한 문제 발견. 추가로 요청: 턴 개념이 화면에 명확히 표기되어야 하고, 현재 자기 턴인 사람의 프로필을 시각적으로 강조 표시해야 함.

### 원인 — 서버에 턴 검증 자체가 없음

`src/features/betting/actions.ts:126`의 `placeBet` 서버 액션이 호출하는 유일한 검증 함수는 `validateBetSemantics`(`actions.ts:62-124`)이고, 이게 확인하는 건 다음 뿐임:
- 호출자 본인의 마지막 accepted 액션이 fold/allin이었는지(`actions.ts:76-90`)
- 베팅 금액이 콜/레이즈 규칙에 맞는지(`actions.ts:103-123`, `round-bet-state.ts`의 `neededToCall`/`minimumRaiseAmount` 사용)

**"지금 이 유저의 차례가 맞는지"를 확인하는 코드가 어디에도 없음.** 그래서:
- A가 방금 call/raise를 했어도(fold/allin이 아니므로) 곧바로 다시 `placeBet`을 호출하면 그대로 accepted 처리됨 (연속 베팅 가능)
- B가 한 번도 액션하지 않은 상태에서 A가 B의 차례를 건너뛰고 또 베팅해도 막을 방법이 없음

턴 순서를 계산하는 로직은 프로젝트 전체에서 `src/features/game/components/game-table.tsx:102-123`의 `nextActorId` 딱 하나뿐인데, 이건 **클라이언트 전용 `useMemo`로 좌석 하이라이트 UI에만 쓰이고**(`game-table.tsx:227` `isNext = roundActive && nextActorId === member.userId`), 서버(`src/features/betting/actions.ts`) 어디에도 대응하는 로직이 없음. 즉 UI에는 "다음 차례" 표시가 이미 있지만(좌석에 골드 링 하이라이트, `game-table.tsx:264-266`), **그건 순전히 눈속임 표시일 뿐 실제로 차례를 강제하지 않음.**

동시성 제어(`lockRoom`, `actions.ts:142`, room당 advisory lock)와 `bet_actions` unique 제약(`round_id, seq`)은 잔액 계산·seq 충돌 같은 데이터 무결성만 보장하며 턴 순서와 무관함.

`docs/02-data-model.md`, `docs/04-game-engines.md`에도 턴 순서를 서버가 강제해야 한다는 설계 자체가 없음 — 문서-코드 괴리가 아니라 애초에 스펙 단계부터 누락된 것으로 보임.

### 다음 사람이 할 일

1. **서버 검증 추가 (핵심, 우선)**: `validateBetSemantics`(`src/features/betting/actions.ts:62-124`) 안에 턴 검증 단계 추가. `nextActorId`(`game-table.tsx:102-123`)와 동등한 순수 함수를 서버에서 재사용 가능한 위치(`src/features/betting/round-bet-state.ts` 근처, 게임 엔진은 순수 함수 규칙 — CLAUDE.md)로 옮기거나 새로 만들어서, `placeBet`이 액션을 accept하기 전에 "호출자가 실제로 다음 차례인가"를 확인해야 함. `approveBet`(`actions.ts:273-391`)에도 동일 검증 필요할 수 있음(대리 베팅 승인 경로).
   - 주의: `nextActorId`는 좌석 순서(멤버 배열 인덱스)를 기준으로 다음 사람을 찾는데, 이게 실제 섯다/포커의 베팅 순서 규칙(예: 선베팅자부터 시계방향)과 정확히 일치하는지 먼저 검증할 것 — 클라이언트 표시용으로만 쓰였을 때는 틀려도 눈에 덜 띄었을 수 있음.
2. **자기 턴 프로필 강조 표시**: `game-table.tsx:264-266`에 이미 `isNext` 조건으로 골드 링 하이라이트(`ring-2 ring-gold shadow-...`)가 구현되어 있음 — 사용자가 원하는 "자기 턴인 사람 프로필 표시"가 부분적으로 이미 있는 상태. 다만 위 서버 버그 때문에 이 하이라이트가 실제 차례와 무관하게 아무 의미 없는 장식이 되어 있었을 가능성이 큼. 서버 검증을 고치고 나면 이 하이라이트가 실제로 신뢰할 수 있는 표시가 됨 — 시각적으로 더 명확히 하고 싶다면(예: 액션바 자체에도 "지금 OO님 차례" 문구 추가) 같이 검토.
3. 액션바(`action-bar.tsx`)에도 "내 차례가 아니면 버튼 비활성화 + 안내 문구" 추가 검토 — 현재는 `disabled = !round || isPending || gateReason !== null`(`action-bar.tsx:201`)뿐이라 내 차례가 아니어도 버튼이 눌리는 상태로 보임.
4. 서버 검증을 먼저 추가하지 않고 클라이언트만 고치면 여전히 API를 직접 호출해 순서를 무시할 수 있으므로, **반드시 서버(`placeBet`)부터 고칠 것.**

---

## 7. 액션바 "첫 베팅 전" 문구 오표시 — 원인 확인, 미수정

**상태**: 원인 확인 완료. 코드 변경 없음.

### 증상

이미 베팅(레이즈)해서 칩이 줄어든 상태(스크린샷: "내 칩 97" — 100에서 3칩 베팅해서 줄어든 것)인데도 액션바 우측에 "첫 베팅 전"이라는 문구가 표시됨. 실제로는 첫 베팅이 이미 있었던 상태라 모순돼 보임.

### 원인

`src/features/game/components/action-bar.tsx:227-236`:
```tsx
{needed > 0 ? (
  <span>{d.actionBar.toCall} ...</span>
) : (
  <span>{d.actionBar.beforeFirstBet}</span>  // "첫 베팅 전"
)}
```

`needed`는 `neededToCall(betting, self.userId)`(`src/features/betting/round-bet-state.ts:33-35`) — "현재 라운드 최고 베팅액 - 내가 낸 금액"이다. 이 값이 0이 되는 경우는 두 가지인데 코드가 구분하지 않는다:

1. **진짜 첫 베팅 전** — 아직 아무도 베팅 안 함 (`currentToCall === 0`)
2. **내가 이미 최고 베팅자** — 예: 2인방에서 내가 레이즈해서 상대가 아직 콜/재레이즈로 대응하지 않은 상태. 이때 `currentToCall === contributedBy(self)`라서 `needed = 0`이 되지만, 이미 첫 베팅은 있었고 지금은 "상대 차례를 기다리는 중"이다.

스크린샷은 2번 케이스인데도 `d.actionBar.beforeFirstBet`(`ko.ts:483` `'첫 베팅 전'`)이 그대로 뜨는 것 — 조건 분기가 "콜 필요액 0"과 "베팅 자체가 없음"을 같은 것으로 취급해서 생기는 오표시.

참고로 `ActionBar`는 `snapshot.currentRound` 존재 여부만으로 렌더되고(`action-bar.tsx:201` `disabled = !round || ...`), "지금이 내 차례인지"는 이 컴포넌트가 직접 판단하지 않는다 — 차례 판단(`nextActorId`)은 `GameTable`에만 있음(`game-table.tsx:102-123`). 이번 문구 오표시와 별개 사안이지만 관련 있어 참고 삼아 남김 — 액션바 자체가 상시 조작 가능하게 보이는 게 의도인지도 확인해볼 여지가 있음.

### 다음 사람이 할 일

1. `contribution`(`action-bar.tsx:99` `contributedBy(betting, self.userId)`, 이미 계산되어 있음)을 이용해 조건을 세분화:
   - `betting.currentToCall === 0` → 진짜 "첫 베팅 전"
   - `needed === 0 && contribution > 0` → "내 차례 아님/상대 대기 중" 류의 새 문구 필요 (예: `d.actionBar.waitingForOthers`)
2. `ko.ts`/`en.ts`에 새 키 추가.
3. 위에서 참고로 남긴 "내 차례가 아닐 때도 액션바가 조작 가능하게 뜨는지" 여부는 별도로 확인 — 이번 조사 범위 밖이라 결론 안 냄.

---

## 6. 모바일 가로(landscape) 전용 방 화면 — 아이디어 단계, 미구현

**상태**: 요청 접수만 완료. 설계·구현 없음. 4번 항목(모바일 세로 레이아웃이 너무 길어지는 문제)과 같은 화면(방/테이블)을 다루므로 함께 볼 것.

### 요청 배경

사용자가 다른 섯다 앱의 스크린샷(참고 이미지, 이 세션에만 첨부되어 저장되지 않음 — 필요하면 사용자에게 다시 요청)을 근거로, 모바일에서 세로 모드 대신 **가로 모드 전용 레이아웃**을 구상해야 하지 않겠냐는 아이디어를 제시함. 참고 이미지 특징:
- 좌우로 넓게 참가자 좌석 배치(원형이 아니라 화면 가로 폭을 채우는 배치)
- 중앙에 판돈·최근 결과가 가로로 넓게 표시
- 하단에 감정표현(리액션) 버튼 바가 가로로 나열
- **실제 카드(패)는 화면에 노출되지 않음** — 사용자도 "실제 카드는 안 보여도 되겠지" 라고 명시함. 이 앱은 애초에 참가자 손패를 다른 사람에게 보여주는 기능이 없으므로(각자 실물 화투를 들고 직접 보고, 앱은 베팅·정산만 기록) 이 부분은 기존 설계와 그대로 맞음 — 카드 UI를 새로 만들 필요는 없다는 뜻으로 이해하면 됨.

### 현재 코드 상태 — 가로 모드는 사실상 막혀 있음

`src/app/manifest.ts:11` — PWA manifest에 `orientation: 'portrait'`로 **명시적으로 세로 고정**되어 있음. 홈 화면에 설치된 PWA는 이 설정 때문에 기기가 가로로 돌아가도 앱 자체가 세로로 잠길 수 있음(브라우저 탭으로 열면 이 제약은 안 걸리고 OS의 자동 회전 설정을 따름 — PWA installed 모드에서만 강제됨).

방 화면(`src/features/game/components/room-client.tsx`, `game-table.tsx`, `action-bar.tsx` 등)에는 `orientation` 미디어 쿼리나 가로 전용 분기가 전혀 없음 — 지금은 세로 폭 기준(`sm:`/`lg:` 브레이크포인트)으로만 반응형이 짜여 있고, 가로로 돌리면 그냥 좁은 세로 레이아웃이 옆으로 넓어질 뿐 별도 최적화가 없음.

### 다음 사람이 할 일 (설계는 아직 없음, 확인부터 필요)

1. **`manifest.ts`의 `orientation: 'portrait'`를 바꿀지부터 결정** — `'any'` 또는 `'landscape'`로 바꾸거나, 방 화면에서만 가로를 허용하고 나머지 화면(로비, 랭킹 등)은 세로 유지하는 하이브리드가 필요한지 확인. Web 표준 PWA manifest는 앱 전체 단위로만 orientation을 설정하므로, 화면별로 다르게 하려면 Screen Orientation API(`screen.orientation.lock()`)를 방 페이지 진입 시 JS로 호출하는 방식이 필요할 수 있음(iOS Safari는 이 API 지원이 제한적이라 실기기 검증 필요).
2. 4번 항목의 세로 레이아웃 문제(GameTable의 세로로 긴 aspect ratio, DealerPanel이 이어붙어서 길어지는 문제)와 이 가로 레이아웃 아이디어를 **함께 설계**하는 게 효율적일 수 있음 — 가로 모드에서는 원형 테이블 대신 참고 이미지처럼 좌우 분산 배치가 자연스러울 수 있으므로, `GameTable`의 좌석 배치 로직(`seatX`/`seatY`, 각도 기반) 자체를 가로/세로 분기하거나 아예 다른 배치 알고리즘이 필요할 수 있음.
3. 이 앱은 카드 이미지를 상대에게 보여주지 않는 게 기존 설계이므로(각자 실물 패 확인), 가로 레이아웃에서도 카드 UI 자체는 추가하지 않는 방향으로 진행하면 됨 — 참고 이미지의 카드 표시는 이 앱과 무관한 참고 대상일 뿐.
4. 사용자와 다음을 먼저 확정할 것: (a) 가로 모드를 강제할지 세로도 계속 지원할지, (b) PWA orientation 설정을 바꿀지, (c) 어떤 화면(로비/방/랭킹 등)까지 가로 대응 범위에 넣을지.

---

## 5. 섯다 레이즈 배수/상한 규칙 — 완전 미구현 (설계 필요)

**상태**: 조사만 완료. 규칙 자체가 코드·문서 어디에도 정의돼 있지 않음 — 버그가 아니라 애초에 안 만들어진 기능.

### 확인된 사실

`src/features/betting/round-bet-state.ts:37-39`(`minimumRaiseAmount`)와 `src/features/betting/actions.ts:62-124`(`validateBetSemantics`)가 베팅 검증의 전부인데, 강제되는 건 **최소 레이즈 하한(직전 콜 필요액 이상, 또는 첫 베팅이면 `baseBet` 이상)** 뿐이다. 다음은 전혀 검증되지 않는다:

- **레이즈 배수 강제** (예: "따당" = 직전 베팅의 정확히 2배로만 레이즈 가능) — 없음. `src/features/game/components/shared.ts:89-102`의 `ttadang: lastBet * 2`는 UI에서 버튼 하나로 그 금액을 자동 채워주는 **입력 편의 프리셋일 뿐**, 서버가 `amount === lastBet * 2`를 강제하지 않는다. `minRaise` 이상 잔액 미만이면 임의의 정수 금액이 다 통과됨(`actions.ts:119-123`).
- **판돈(pot) 대비 상한** (pot-limit 등) — 없음. "하프"/"풀" 프리셋도 마찬가지로 라벨일 뿐.
- **총 판돈/베팅 상한** — zod의 `amount: z.number().int().min(0).max(10_000_000)`(`actions.ts:52-58`)는 시스템 전역 절대치일 뿐, 직전 베팅이나 판돈과 연동된 상한이 아님.
- 방 생성 시 저장되는 `rulePreset`(`src/features/game/actions.ts:58-62`, `fair-play-settings.ts:4-11`)에도 레이즈 배수/상한 관련 필드가 아예 없음.
- `docs/04-game-engines.md`, `docs/10-virtual-credit-and-fair-play.md`, `docs/02-data-model.md` 어디에도 이런 규칙이 "구현되어야 한다"고 명시돼 있지 않음 — 즉 문서-코드 괴리가 아니라 설계 자체가 없는 상태.

### 다음 사람이 할 일

1. 사용자와 먼저 **어떤 규칙을 원하는지 확정**해야 함 — 후보:
   - 따당 강제: 첫 레이즈 이후 재레이즈는 직전 베팅의 정배수(2배 등)로만 허용
   - pot-limit: 레이즈는 현재 판돈 이하로 제한
   - 하우스 룰로 방 생성 시 선택 가능하게(강제 규칙 없음 유지 옵션 포함)
2. 규칙이 정해지면 `rulePreset` 스키마(`src/features/game/actions.ts:30-39` 근처, `readBaseBet`/`readMaxMembers`와 같은 패턴)에 필드 추가.
3. 검증 로직은 `validateBetSemantics`(`src/features/betting/actions.ts:62-124`) 안에 `minimumRaiseAmount`와 나란히 상한 검증 함수 추가 — 서버(`actions.ts`)와 클라이언트(`action-bar.tsx`, `member-sheet-proxy-bet.tsx`) 양쪽이 같은 순수 함수를 import해서 쓰는 기존 패턴을 그대로 따를 것(`round-bet-state.ts`에 추가하는 게 자연스러움).
4. 에러 메시지 키(`ko.ts`/`en.ts`, 예: `errors.raiseAboveMaximum`) 신규 추가 필요.
5. 게임 엔진 순수 함수 규칙(`CLAUDE.md` — I/O 금지, 테스트 가능성) 준수할 것.

---

## 4. 방(테이블) 화면 모바일 레이아웃 — 세로로 너무 길어짐 (문제 정리만, 미구현)

**상태**: 미구현. 원인 분석만 완료, 코드 변경 없음. 스크린샷 기반 신고(2인방, 섯다, `Test Room`) — 첨부 이미지는 이 대화 세션에만 있고 저장되지 않았으니 재현하려면 방을 새로 만들어 모바일 뷰에서 확인할 것.

### 증상

모바일 화면에서 방(테이블) 화면이 세로로 매우 길어짐. 딜러 컨트롤 패널의 "판 종료"/"판 무효" 버튼이 하단 고정 액션바(체크·레이즈·다이)에 가려서 스크롤해야 겨우 보이거나 잘림.

### 원인 분석

레이아웃 흐름은 `src/features/game/components/room-client.tsx:206-324`:
1. `RoomHeader` (상단 방 정보)
2. `RoomConnectionBar`
3. 로비가 아니면 → `lg:grid lg:grid-cols-12`로 좌/우 분할하지만, **모바일(`lg` 미만)에서는 grid가 적용 안 되고 모든 섹션이 그냥 세로로 순서대로 쌓임**: `FairnessPanel` → 지난 판 요약 → `GameTable`(원형 테이블) → `ActionBar`(베팅 가능하면) → `DealerPanel`(딜러/방장이면) → `RoundLog`.
2. `GameTable`(`src/features/game/components/game-table.tsx:144-153`)의 컨테이너가 `aspect-[4/5] sm:aspect-[16/10]` (7명 이상이면 `aspect-[5/7] sm:aspect-square`) — 좌석이 원형(각도 기반, `seatX`/`seatY`)으로 배치되는 원형 테이블 룩을 내려고 세로로 긴 비율을 씀. 인원수와 무관하게 이 비율이 고정이라, 2인방처럼 좌석이 적어도 세로 공간을 그대로 다 차지함(스크린샷에서 아바타 2개가 위/아래로 멀리 떨어져 있는 이유).
3. `DealerPanel`(`src/features/game/components/dealer-panel.tsx`)이 `GameTable`/`ActionBar` 아래 `room-client.tsx:306-317`에서 별도 섹션으로 이어 붙음 — 데스크톱에선 우측 컬럼(`lg:col-span-5`)으로 빠지지만 모바일에선 그냥 아래로 계속 쌓임.
4. `ActionBar`(`src/features/game/components/action-bar.tsx:210`)는 모바일에서 `fixed inset-x-0 bottom-0`으로 화면 하단 고정. `main` 컨테이너(`room-client.tsx:210`)가 `pb-[calc(var(--action-bar-h,0px)+1.5rem)]`로 그 높이만큼 하단 여백을 주긴 하지만, 이건 **페이지 전체 스크롤 시 마지막 콘텐츠가 안 가려지게 하는 용도**일 뿐 — `DealerPanel`이 `ActionBar`보다 위에 있어도 화면 높이 안에 다 안 들어오면 스크롤해야 하고, 딜러 겸 방장인 유저는 `DealerPanel` + `ActionBar`가 둘 다 뜨는 상황이라 세로 길이가 특히 심해짐. 스크린샷은 이 상태(딜러 컨트롤 하단이 액션바 위에서 살짝 잘려 보이는 것)로 보임.

### 참고 — 방 인원 제한

방 최대 인원은 10명(`src/features/game/actions.ts:235` `maxMembers: z.number().int().min(2).max(10)`, 미지정 시 기본값도 10 — `src/features/game/action-helpers.ts:68-71` `readMaxMembers`). `GameTable`은 `members.length >= 7`이면 `compact` 모드로 좌석을 축소함(`game-table.tsx:65`). 즉 레이아웃은 2명~10명까지 전부 커버해야 함 — 개선 시 인원수 극단(2명, 10명) 양쪽에서 다 확인 필요.

### 사용자가 검토를 보류한 개선 방향 (참고용 — 확정 아님)

다음 사람이 논의를 이어가려면 참고:
- **안 A**: 인원수에 따라 `GameTable`의 aspect ratio를 동적으로 좁혀서(예: 2~4명일 때 `4/3`~`16/10` 등 더 납작하게) 세로 공간을 절약. `DealerPanel`은 모바일에서 기본 접힌 상태로 두거나 별도 탭(테이블/딜러)으로 분리하는 안도 있었음.
- **안 B**: `DealerPanel`만 바텀시트/드로어로 전환해서 테이블 레이아웃은 그대로 두고 딜러 컨트롤만 시트로 올라오게 함.

둘 다 사용자가 아직 확정하지 않음 — "문제사항만 정리해서 handoff에 적어달라"는 요청이었으므로, 구현 착수 전에 방향을 다시 확인할 것.

---

## 3. 계정 설정 페이지 (닉네임 등 프로필 수정) — 미구현, 요청만 접수

**상태**: 미구현. 코드 조사·조사 결과만 기록. 코드 변경 없음.

### 요청

사용자 본인이 표시 이름(닉네임) 등을 바꿀 수 있는 세팅 페이지가 있어야 할 것 같다는 요청. 현재 `displayName`(`drizzle/schema.ts`의 `users.displayName`, not null)은 회원가입 시(`registerAndLogin`, `src/features/auth/actions.ts`) 또는 SSO/게스트 최초 로그인 시 한 번 정해지고, **이후 본인이 직접 바꿀 UI가 전혀 없음**. `/wallet` 페이지는 있지만 계정/프로필 설정 페이지(`/settings`, `/profile` 등) 자체가 존재하지 않음 (`src/app` 하위 확인 완료).

### 관련 스키마 (`drizzle/schema.ts`, `users` 테이블)

- `username: text('username').unique()` — `local:` 계정만 있음(로그인 ID, 이 프로젝트 컨벤션상 아마 불변으로 두는 게 맞을 가능성 — 바꾸면 다른 곳에서 `local:{username}` 형태로 `authentikSub`을 참조하는 코드가 있는지 확인 필요)
- `displayName: text('display_name').notNull()` — 요청의 핵심 대상. 랭킹·방 안 표시 등 여러 곳에서 참조됨.
- `avatarUrl: text('avatar_url')` — nullable, 현재 UI에서 설정하는 곳이 없어 보임 — 같이 손볼지 확인 필요.
- `phone: text('phone').unique()` — 가입 시 필수값. 바꾸는 UI는 민감할 수 있어 (본인 인증 없이 바꾸면 계정 탈취 우려) 별도 검토 필요.

### 다음 사람이 할 일 (설계 스케치, 미검증)

1. 범위부터 사용자와 확정: 닉네임(`displayName`)만 바꿀지, 아바타·전화번호도 포함할지.
2. 새 라우트 필요: 예 `src/app/settings/page.tsx` (또는 기존 `/wallet`처럼 홈 어딘가에 진입점 추가).
3. 서버 액션: `src/features/auth/actions.ts` 또는 새 `src/features/auth/profile-actions.ts`에 `updateDisplayName` 류 액션 추가 — `currentUserId()`(`src/features/auth/session.ts`)로 본인 확인 후 `users` 테이블 update. `registerSchema`의 `name` 검증 규칙(`z.string().trim().min(1).max(20)`)을 그대로 재사용.
4. 게스트 계정(`authentikSub` prefix `guest:`)은 이름이 토큰 발급 시 정해지는 구조라(`docs/07-auth-and-security.md` 참고 — 게스트는 토큰+이름 조합으로 `authentikSub`이 고정됨), displayName을 나중에 바꾸면 `authentikSub`과 어긋날 수 있음 — 게스트는 이 기능에서 제외하거나 별도 처리 필요. 회원가입/SSO 계정만 우선 지원하는 게 안전해 보임.
5. i18n 키(`ko.ts`/`en.ts`) 추가 필요.

---

## 2. 족보 판독 — 포커 족보 설명 + 부분 선택 시 실시간 미리보기

**상태**: 미구현. 조사·설계·계산량 실측만 완료. 코드 변경 없음.

### 요청 배경

`/advisor` 화면(족보 판독)에 두 가지 요청:

1. 포커 족보 순위 패널(`src/features/jokbo-advisor/components/poker-ranking-panel.tsx`)에 각 족보가 뭘 뜻하는지 설명이 없음 — 섯다 랭킹 패널은 이미 대표 조합(예: "1광 + 3광", "10월 2장")을 표시하도록 고쳤는데 포커는 라벨만 있음.
2. 섯다·포커 모두에서 카드를 선택하는 도중(필요 장수를 다 채우기 전)에도 "지금 든 카드로 나올 수 있는 족보"를 미리 보여줬으면 함.

### 요청 1 — 포커 족보 설명 추가 (구현 난이도 낮음)

`POKER_RANK_TABLE`(`src/features/jokbo-advisor/components/poker-rank-table.ts`)이 `label`만 갖고 있음. 섯다 쪽 패턴(`SEOTDA_RANK_TABLE`의 `detail` 필드, `SeotdaRankDetail` 유니온 타입, `src/features/jokbo-advisor/components/seotda-rank-table.ts`)을 참고해서 각 `PokerCategory`에 짧은 설명을 매핑하면 됨. 예:

- `royal-flush`: 같은 무늬 10-J-Q-K-A
- `straight-flush`: 같은 무늬 연속 5장
- `four-of-a-kind`: 같은 숫자 4장
- `full-house`: 트리플 + 원페어
- `flush`: 같은 무늬 5장
- `straight`: 연속된 숫자 5장
- `three-of-a-kind`: 같은 숫자 3장
- `two-pair`: 페어 2쌍
- `one-pair`: 같은 숫자 2장
- `high-card`: 위 조합 없음

`d.advisor.pokerRanking`에 `category<Name>Detail` 같은 키를 `ko.ts`/`en.ts` 양쪽에 추가하고, `poker-ranking-panel.tsx`에서 섯다 패널처럼 라벨 아래 작은 텍스트로 렌더하면 됨. 포커는 카테고리가 고정 10단계라 그냥 정적 문자열 매핑으로 충분 — 섯다처럼 계산 로직 불필요.

### 요청 2 — 부분 선택 시 실시간 족보 미리보기 (계산량 조사 완료)

**섯다**: 2장 중 1장만 고른 상태. 남은 덱은 19장 — 상대 카드 후보 19가지를 전부 `evaluateSeotdaHand`로 평가해도 계산량 미미(기존 `stats.ts`의 `seotdaStats`가 이미 비슷한 규모를 순회함). 실시간 계산에 문제 없음. 카테고리별로 그룹핑해서 "각 족보가 몇 가지 조합으로 나올 수 있는지" 확률로 보여주면 됨.

**포커**: 사용자가 "확률까지 계산해서 보여줘"를 선택함(정적 5장 확률표가 아니라, 지금 쥔 카드 조건부 확률). held(보유 카드 수)별로 남은 덱에서 뽑아야 할 조합 수를 Node.js(`tsx`)로 실측:

| 보유 카드 수 | 필요 장수 | 조합 수 | evaluatePokerHand 순회 시간 (Node, M-series) |
| --- | --- | --- | --- |
| 1장 | 4장 | 249,900 | ~520ms |
| 2장 | 3장 | 19,600 | ~49ms |
| 3장 | 2장 | 1,176 | ~5ms |
| 4장 | 1장 | 48 | 무시 가능 |
| 5장 이상 | 0장 (확정) | 1 | 기존 `PokerResult`가 이미 처리 |

브라우저 메인 스레드는 이보다 느릴 수 있음. **합의된 방향: 3장 이상 선택했을 때만 실시간 계산해서 미리보기 표시, 1~2장은 기존처럼 "카드 N장 더 선택"만 표시(계산 안 함).** 3장부터는 최대 1,176 조합, 5ms 이하라 클릭마다 돌려도 무리 없음.

### 구현 스케치

- 섯다: `seotda-rank-table.ts`의 `buildRankTable`과 유사하게, "고정된 카드 1장 + 남은 덱 순회" 헬퍼를 `advisor-results.tsx` 근처 또는 별도 `partial-preview.ts`에 추가. `stats.ts`의 `seotdaStats` 이중 루프 패턴 참고.
- 포커: held 카드 배열을 받아 `C(remaining, 5-held.length)` 조합을 모두 생성 → 각각 `evaluatePokerHand` → `category`별로 집계 → 확률(%)로 변환. **3장 미만이면 계산 자체를 건너뛰고 기존 UI(`pokerMoreCards` 문구)를 그대로 보여줄 것.**
- 조합 생성 자체는 가벼움(1,176개 기준 1ms 미만) — 웹워커 등 별도 최적화 불필요.
- UI 표시 형태(카테고리별 막대/퍼센트 리스트 등)는 미정 — 기존 `SeotdaResult`/`PokerResult`의 톤에 맞춰 결정.
- i18n 키는 `ko.ts`/`en.ts` 양쪽에 동시 추가할 것 (게임 용어는 번역하지 않는 컨벤션 — `CLAUDE.md` 참고).

---

## 참고 — 로컬 개발 환경 이슈 (이미 해결됨)

- 전역 `pnpm` 바이너리가 corepack shim으로 깨져 있었음 (`ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`). `~/.nvm/versions/node/<ver>/bin/pnpm` 삭제 후 `npm install -g pnpm@11.15.1`로 재설치하면 해결.
- `package.json`의 `pnpm@11.15.1`은 Node ≥22.13 요구. 이 저장소의 `.nvmrc`는 이미 `22`로 고정되어 있음 — `nvm use`(또는 v24 계열)로 맞추면 됨.
