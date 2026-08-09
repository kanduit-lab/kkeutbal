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

섹션 번호는 `TODO.md`가 참조하므로 재사용하지 않는다. **반영이 끝난 항목은 삭제한다** —
무엇을 고쳤는지는 Git 이력이 갖고 있고, 여기 남기면 "아직 문제인 것"과 구분이 안 된다.
2026-07-30에 2·3·4·5·6·7·8·9·10·12·14·15·16번을 그렇게 지웠다.

---

## 11. 고정 뷰포트 레이아웃 규약

목록·조회 화면은 **문서 스크롤을 만들지 않는다**. 넘치는 내용은 페이지를 늘리는 대신
(a) 뷰포트에 들어가는 줄 수만 그리고 나머지를 페이지로 넘기거나, (b) 명시적으로 경계가 있는
내부 스크롤 영역에 담는다.

### 구성 요소

| 요소 | 위치 | 역할 |
| --- | --- | --- |
| `FixedPage` / `FixedBody` / `ScrollPane` | `src/components/ui/page-shell.tsx` | 남은 높이를 정확히 차지하는 `main`, 그 안의 신축 영역, 스크롤이 허용되는 유일한 지점 |
| `useFitCount` / `usePagedRows` / `Pager` | `src/components/ui/paged.tsx` | 영역 높이 ÷ 줄 높이로 페이지 크기를 정하고, 검색·필터가 바뀌면 1페이지로 되돌린다 |
| `DataTable` | `src/components/ui/data-table.tsx` | 데스크톱 표. 줄 높이 `DATA_TABLE_ROW_H`, 머리글 높이 `DATA_TABLE_HEADER_H`가 페이지 계산과 짝을 이룬다 |
| `PaneGroup` | `src/components/ui/pane-group.tsx` | 데스크톱은 패널 나란히, 모바일은 탭으로 하나씩 |

### 높이가 확정되어야 `flex-1`이 뜻을 갖는다 (가장 자주 틀리는 지점)

`main`은 **`fixed-page` 클래스를 반드시 달아야 한다.** `src/app/globals.css`의
`body:has(> main.fixed-page)`가 그 표식을 보고 `height: 100dvh; overflow: hidden`을 켠다.

`min-height`만 있는 컨테이너는 definite height가 아니어서 높이가 콘텐츠로 먼저 정해지고,
그러면 자식의 `flex-1 min-h-0`은 **아무것도 제한하지 못한다**. 이 규약을 도입할 때 셸이
`min-height: 100dvh`만 갖고 있었고, 그래서 `/rooms/new`가 839px 뷰포트에서 1084px까지 자랐다.
높이를 확정하면 `flex-1`이 남은 공간만 받으므로 프로모션 배너(`PromotionHost`의 `aside`)가
위에 붙어도 그만큼 빠진 높이를 정확히 쓴다.

직접 `main`을 만드는 화면(방·모니터처럼 `FixedPage`를 안 쓰는 경우)은 이 클래스를 손으로
붙여야 한다. 붙이지 않으면 제약이 조용히 무력화된다 — 방 화면과 모니터 화면이 실제로 그
상태였고, 로비가 Pixel 7에서 88px, 데스크톱에서 193px 넘쳤다.

**`lg:`만 걸린 제약은 제약이 아니다.** 같은 사고의 다른 얼굴이다. 방·모니터 화면은
`lg:min-h-0 lg:flex-1 lg:overflow-hidden`이라 폰에서는 아무 제약이 없었다. 두 폭 모두에
걸어야 한다.

### 적용 여부

- 적용: `/`, `/admin`, `/ranking`, `/ranking/player/[id]`, `/wallet`, `/advisor`, `/rooms/new`,
  `/rooms/[code]`, `/rooms/[code]/result`, `/rooms/[code]/monitor`
- 미적용(의도): `/guide/*`, `/about` — 읽는 문서라서 문서 스크롤이 맞다
- **로딩 골격도 같은 규약을 따른다.** `loading.tsx`는 전환 중에만 뜨지만, 제약이 없으면 그
  순간 문서 스크롤이 생긴다. `src/app/rooms/[code]/loading.tsx`만 손으로 만든 `main`이라
  963px까지 자랐고, 모니터 화면으로 이동하는 순간에 드러났다. 나머지 `loading.tsx`는
  전부 `FixedPage`를 쓴다.
- **"한 패널 화면은 예외"가 아니다**: 우선 불변식은 "문서 스크롤 없음"이고 `flex-1` 중앙
  정렬은 그걸 지키는 한에서의 기본 선택지다. 필드가 많아 고정 뷰포트에 안 들어가는 화면
  (5필드 가입 폼)은 `FixedPage`+`ScrollPane`으로 전환해 내부 스크롤로 흡수한다.

### 무엇이 이 규약을 강제하는가

**지금은 아무것도 강제하지 않는다.** 예전에는 `e2e/support.ts`의 `expectNoDocumentScroll`이
불변식이었고 공개·인증 화면과 방·모니터·결과 화면에 그걸 걸었지만, e2e 스위트는
2026-08-09에 제거했다.

타입·lint·단위 테스트는 이 계열 결함을 **하나도** 잡지 못한다. 위에 적힌 위반 네 건은 전부
e2e가 처음 찾은 것이고, 제거 당일에도 카드 픽커가 탭을 먹는 회귀를 e2e만 잡았다(CI는
통과했다). 화면을 건드리면 폰·데스크톱 폭에서 직접 열어 문서 스크롤과 겹침을 확인할 것.

### 줄 높이를 바꿀 때

모바일 카드 줄 높이는 각 화면 파일 상단의 `ROW_H` 상수이고 실제 마크업(`h-16` + `space-y-2`)과
짝을 맞춰야 한다. 한쪽만 바꾸면 페이지당 줄 수가 틀려서 마지막 줄이 잘리거나 빈 공간이 남는다.

---

## 17. 누적 비용 — 안전정수 트리거와 랭킹 집계

둘 다 지금 결함은 아니고 **실측 없이는 고칠 근거가 없는** 용량 계획 항목이다.

- `drizzle/migrations/0017_bored_brood.sql`의 `assert_user_chip_activity_number_safe()`는
  `chip_ledger`·`buy_ins` INSERT마다 해당 사용자·해당 방의 전체 이력을 `SUM(abs(...))`로 다시
  집계한다. 인덱스(`chip_ledger_user_idx`, `buy_ins_user_idx`)가 있어 풀스캔은 아니지만
  누적 활동량에 비례해 매 베팅·바이인 비용이 는다. 캡·아카이빙 정책이 없다.
- `src/features/ranking/cumulative-ranking.ts`의 `getCumulativeRanking`은 `/ranking` 방문마다
  `settled`/`closed` 모든 방의 `chip_ledger`·`buy_ins`·`rounds`·`room_members`를 전량 집계한다.
  캐시·기본 시간 범위 제한이 없다(`filter.since`는 옵션).

### 미확정

실사용 규모(MT·모임 단위)에서 임계치에 도달하는지. 도달한다면 사용자별 누적 카운터 컬럼,
랭킹 스냅샷/머티리얼라이즈드 뷰가 후보다. [`docs/02-data-model.md`](02-data-model.md)의
"방 보존 기간·아카이빙 정책 미정"과 같은 뿌리다.

---

## 13. SSO 연결 — 코드로 검증하지 못한 부분

자동 병합 취약점과 명시적 연결 흐름 구현은 끝났다(정본은
[`docs/07-auth-and-security.md`](07-auth-and-security.md)). 남은 것은 실물 없이 확인할 수 없는
것들이다.

### 남은 위험 (알면서 수용)

공격자가 피해자의 이미 로그인된 브라우저에 일시 접근해 "연결" 클릭까지만 하고, 나중에 자신의
Authentik 계정으로 흐름을 완주하면 피해자 계정에 공격자 sub가 붙을 수 있다(소셜 계정 연결 CSRF
계열). 링크 쿠키 TTL 5분으로 창을 좁혔지만 "콜백 시점에도 같은 세션인가"를 재검증하지는 않았다
— 그러려면 next-auth가 공식으로 노출하지 않는 내부 토큰 병합에 의존해야 해서 추측 구현을 하지
않았다. 원래 취약점(아이디만 알면 원격 탈취)보다 훨씬 좁은 위협 모델(사전 세션 접근 필요)이다.

### 미확정

- Authentik이 `phone_number_verified`를 실제로 발급하는지. 발급하지 않으면 전화번호 자동 연결은
  사실상 꺼진 상태이고 `/account`의 명시적 연결이 유일한 경로가 된다.
- **실제 OAuth 왕복은 검증하지 못했다.** Authentik 인스턴스가 아직 없다(연동은 나중 예정).
  jwt 콜백 안에서 `cookies()`가 그 요청의 쿠키를 읽는지, SameSite=Lax 쿠키가 IdP 리다이렉트에서
  살아남는지가 실물 확인 대상이다.

---

## 확인했지만 문제 없던 것 (같은 곳을 다시 파지 않도록)

2026-07-30 감사 기준.

- **트랜잭션·잠금**: 방/판/베팅 액션 전부 `pg_advisory_xact_lock(hashtextextended(roomId, 42))`로
  방 단위 직렬화 후 트랜잭션 안에서 잔액을 재조회한다. 두 딜러의 동시 승인, 수동 `endRound`와
  자동 종료(`round-finalize.ts`의 `autoSettleRoundIfComplete`)의 경쟁 모두 같은 락으로
  직렬화돼 이중 정산이 불가능하다.
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

## 함정 — 다시 밟기 쉬운 것들

버그가 아니라 **구조상 틀리기 쉬운 지점**이다. 둘 다 실제로 한 번 밟았다.

- **drizzle raw `execute`의 결과는 파싱되지 않은 값이다.** `tx.execute()`에 넘기는 raw SQL에는
  컬럼 타입 정보가 없어 postgres-js가 값을 매핑하지 않고 문자열로 돌려준다
  (`timestamptz` → `'2026-07-30 09:25:15.752893+00'`). `sql<{ now: Date }>` 같은 타입 인자는
  **런타임을 보장하지 않는다.** 공정 딜의 `fairDatabaseNow`가 `instanceof Date`로 검사해서 검증
  딜 라운드가 시작조차 못 했고, 타입·lint·단위 테스트 어느 것도 잡지 못했다. 시각·숫자를 raw
  `execute`로 읽어야 하면 SQL 쪽에서 포맷을 못 박고(`to_char(... at time zone 'utc', ...)`)
  직접 파싱한다. 값이 uuid·text면 그냥 문자열이라 문제가 없다
  (`wallet/actions.ts`의 `admin_adjust_credit`이 그 예).
- **딜러 액션은 뷰포트마다 다른 곳에 있다.** 데스크톱은 `DealerPanel`이 항상 펼쳐져 있고,
  모바일은 판 시작·판 종료·판 무효만 퀵바(`dealer-quick-bar.tsx`)에 있고 나머지(세션 정산·지난
  판 취소)는 🛠️ 시트 안이다. 게다가 (a) 시트는 승자 선택 모드에서 스스로 열리고 그 모드를
  벗어나면 스스로 닫히며, (b) `DealerPanel`은 `mode === 'idle'`일 때만 액션 격자를 렌더하고,
  (c) 레이아웃 판정(`useIsDesktop`)은 마운트 직후 한 번 뒤집힌다. 자동화·검증 코드가 "지금
  보이는지"로 분기하면 세 가지 모두에 걸려 틀린다.

---

## 참고 — 로컬 개발 환경

다른 머신에서도 겪을 수 있어 남긴다.

- 전역 `pnpm`이 corepack shim으로 깨지는 경우가 있다(`ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`). `~/.nvm/versions/node/<ver>/bin/pnpm`을 지우고 `npm install -g pnpm@11.15.1`로 재설치하면 해결된다.
- `package.json`의 `pnpm@11.15.1`은 Node 22.13 이상을 요구한다. `.nvmrc`는 `22`로 고정돼 있다.
- **DB에 남아 있는 `[int]` 접두사 방들은 제거된 통합 테스트의 잔여물이다.** 그 스위트가
  실제 DB에 방을 만들었고, `chip_ledger`가 append-only + `room_id` FK가 cascade라서
  **원장 행이 생긴 방은 삭제 자체가 불가능하다.** 정산하지 않은 채로 남겨 누적 랭킹 집계
  (`settled`/`closed`만 본다)에는 들어가지 않는다. 관리자 콘솔의 일괄 강제 정산으로 닫을 수는 있다.
- **`.env.local`의 테스트 계정 값은 아무 코드도 읽지 않는다.** e2e 스위트와 함께 소비처가
  사라져서 `E2E_*` → `DEV_*`로 이름만 바꿔 뒀다(앱은 원래 읽은 적이 없다). 남겨 둔 이유는
  무작위 32자 비밀번호의 **유일한 사본**이기 때문이다 — 사람이 로그인할 때 여기서 복사한다.
  계정을 붙잡아 두던 통합 테스트도 같은 날 제거했으므로, 이제 이 계정을 참조하는 코드는 하나도
  없다 — 원할 때 DB에서 지우거나 권한을 내려도 아무것도 깨지지 않는다. 셋 다 관리자라 게임 액션
  한도가 면제된다(`consumeRateLimitsUnlessAdmin`).
