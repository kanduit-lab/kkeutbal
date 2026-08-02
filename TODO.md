# TODO

**코드로 끝낼 수 있는 작업만** 관리한다. 실기기·실배포·실물 리허설처럼 사람이 물건을 들고
해야 하는 확인은 여기 열지 않는다 — 순서와 근거는 [`docs/09-roadmap.md`](docs/09-roadmap.md)가,
미확정 설계 질문은 [`docs/12-handoff.md`](docs/12-handoff.md)가 소유한다.

## Priority

### High

- [ ] **게스트 토큰 하나로 같은 토큰의 다른 게스트가 된다**: 게스트 sub가 `guest:{tokenId}:{name.toLowerCase()}`뿐이라 이름만 맞추면 그 계정으로 로그인된다
  - 배경: `src/lib/auth-providers.ts`가 만든 sub를 `provider-account-resolution.ts`가 기존 사용자로 바로 해석한다. 여기에 **인증 없이 호출되는** `getGuestNamesForToken`(`src/features/auth/actions.ts`)이 그 토큰의 표시 이름을 최대 20개 돌려주므로, 토큰을 가진 사람은 이름 목록을 읽고 아무나 골라 그 사람이 될 수 있다. 그 사람이 방장이면 정산·역할 변경·판 종료까지 전부 넘어간다
  - 변경 범위: `src/lib/auth-providers.ts`, `src/features/auth/provider-account-resolution.ts`, `src/features/auth/guest-name-lookup.ts`, `drizzle/schema.ts`(게스트별 비밀값 컬럼), `docs/07-auth-and-security.md`
  - 완료 기준: 이름만으로는 기존 게스트 계정에 로그인되지 않는다. 이름 목록은 인증된 호출에만 응답하거나 없앤다
  - 참조: MT 현장에서 토큰 하나를 여럿이 공유하는 것이 정상 사용 방식이라 실사용 조건에서 재현된다

- [ ] **`/monitor`·`/result`가 방 코드만 알면 열린다**: 참가자 확인 없이 전원의 잔액·바이인·정산표를 그린다
  - 배경: 형제 라우트인 `/history`·`/settings`는 `getMemberRole`로 막는데 이 둘만 빠져 있다. 방 코드는 31글자 6자리(약 29.7비트)이고 이 두 경로에는 rate limit이 없어서, 코드를 훑어 남의 방 돈을 읽는 비용이 사실상 네트워크 속도뿐이다
  - 변경 범위: `src/app/rooms/[code]/monitor/page.tsx`, `src/app/rooms/[code]/result/page.tsx`
  - 완료 기준: 두 화면 모두 참가자가 아니면 거부한다. 전광판을 비참가자에게 열어둘 이유가 있다면 그 결정을 `docs/07-auth-and-security.md`에 적고 노출 범위를 줄인다
  - 참조: `refreshRoom`의 같은 구멍은 막았다(참가자 확인 추가)

- [ ] **짧은 올인이 판을 잠근다**: 잔액이 콜 금액보다 적은 참가자가 올인하면 판이 끝나지 않는다
  - 배경: `bet-amount-rule.ts`는 `amount === balance`인 올인을 허용하는데, `round-completion.ts`는 모든 참가자의 기여액이 `currentToCall`과 같아야 종료로 본다. 그 참가자는 `turn-order.ts`에서 차례에서도 빠지므로 아무도 행동할 수 없고, 딜러가 판 종료나 판 무효를 눌러야만 빠져나온다
  - 변경 범위: `src/features/betting/round-completion.ts`, `src/features/betting/bet-amount-rule.ts`, `src/features/game/round-finalize.ts`
  - 완료 기준: 짧은 올인이 있어도 판이 스스로 종료 단계에 도달한다. 사이드팟을 만들지 않기로 한다면 짧은 올인 자체를 막고 그 이유를 남긴다
  - 참조: 사이드팟 개념이 코드에 없어서, 지금은 500칩만 낸 사람이 5000칩 팟을 통째로 가져간다

### Medium

- [ ] **`drizzle` 마이그레이션 원장에 `0020_lying_leader`가 빠져 있다**: 새 환경에서 `drizzle-kit migrate`가 실패한다
  - 배경: `0020`의 내용(`users.is_managed`)은 supabase 쪽 `add_users_is_managed`로 이미 반영됐는데 `drizzle.__drizzle_migrations`에는 기록되지 않았다. 이 저장소는 그동안 `drizzle_migration_ledger_*_sync` 항목으로 원장을 맞춰 왔는데 이번 것만 누락됐다
  - 변경 범위: supabase 마이그레이션 1건(원장 동기화 전용)
  - 완료 기준: 빈 DB가 아닌 현재 DB에 `drizzle-kit migrate`를 돌려도 `column "is_managed" already exists`로 죽지 않는다
  - 참조: 디스크 `drizzle/migrations/meta/_journal.json`은 21개(idx 0~20), DB 원장은 20개

- [ ] **바이인에 요청 id가 없다**: 재전송 한 번이 그대로 두 번째 바이인이 된다
  - 배경: `adminAdjustCredits`는 `requestId`로 중복을 흡수하는데 `addBuyIn`(`src/features/budget/actions.ts`)에는 그런 키가 없다. 모바일에서 응답이 끊겨 다시 보내면 `buy_ins`·`chip_ledger`·`room_credit_locks`가 한 벌 더 생기고, `account_credit` 방에서는 지갑이 실제로 두 번 잠긴다
  - 변경 범위: `src/features/budget/actions.ts`, `src/features/game/components/member-sheet-buy-in.tsx`, 대응 supabase RPC
  - 완료 기준: 같은 요청을 두 번 보내도 바이인이 한 번만 확정된다

- [ ] **`account_credit` 방에서 바이인 취소가 방을 잠글 수 있다**: 정산이 영영 안 되고 남의 크레딧이 묶인다
  - 배경: `undoLastBuyIn`은 대상의 현재 방 잔액만 보고, 취소 뒤 그 사람의 잔여 칩과 잠금액이 여전히 맞는지는 아무도 안 본다. 판이 오간 뒤 취소하면 칩은 남았는데 잠금이 사라진 상태가 되고, `settle_room_credits`가 보존식 위반으로 예외를 던져 방장도 관리자도 방을 닫을 수 없다
  - 변경 범위: `src/features/budget/actions.ts`, `supabase/migrations/`(release RPC에 사용자별 보존식 검사 추가), 이미 잠긴 방을 위한 복구 경로
  - 완료 기준: 취소 뒤에도 사용자별 `잔여 칩 == 잠금액`이 유지되거나, 깨질 취소는 거부된다

- [ ] **`bet.reverted` 뒤 다른 참가자 화면의 팟이 최대 20초 낡는다**: 그 팟으로 레이즈 프리셋이 계산된다
  - 배경: `event-sync-policy.ts`가 이 이벤트를 `passive`로 두고 재조회를 걸지 않는 근거는 "`afterMutation`이 항상 `state.snapshot`도 함께 보낸다"인데, `use-room-actions.ts`는 그 전송을 `result.success` 조건 아래 둔다. 행동한 사람의 재조회가 8초 타임아웃으로 실패하면 힌트만 날아가고 아무도 다시 읽지 않는다
  - 변경 범위: `src/features/game/components/use-room-actions.ts` 또는 `src/lib/realtime/event-sync-policy.ts`
  - 완료 기준: 되돌리기 뒤 다른 참가자 화면이 폴링을 기다리지 않고 수렴한다

### 정리

- [ ] **모바일 자기 좌석 표시가 둘로 갈렸다**: `MySeatPanel` + `GameTable`의 `excludeSelfSeat` 모드가 어디에도 연결돼 있지 않다
  - 배경: 같은 문제(폰에서 좌석 카드가 겹친다)를 두 방향으로 고쳤다. `a350306`은 좌석 링을 유지한 채 내 좌석만 펠트 밖으로 뺐고, 세로 화면을 노선도+팟으로 다시 짠 쪽은 좌석 링 자체를 걷어내고 `SelfBar`를 쓴다. 후자가 채택돼서 전자의 두 조각이 호출자 없이 남았다
  - 결정할 것: `MySeatPanel`·`excludeSelfSeat`를 지울지, 아니면 좌석 링을 되살릴 여지로 남길지
  - 지울 경우 범위: `src/features/game/components/my-seat-panel.tsx` 삭제, `game-table.tsx`의 `excludeSelfSeat` 분기와 `shared.ts`의 `seatX`/`seatRadiusX` 인자 제거, 두 파일의 `MySeatPanel` 언급 주석 정리
  - 완료 기준: 두 이름 중 어느 쪽도 호출자 없는 상태로 남아 있지 않다

### 운영

- [ ] **테스트 계정 정리**: `testadmin1`/`testadmin2`/`testadmin3`을 배포 전에 없애거나 권한을 내린다
  - 변경 범위: DB(`users`), `.env.local`의 `E2E_*`
  - 완료 기준: 실 사용 DB에 테스트용 관리자 계정이 남아 있지 않다
  - 현재 상태: 비밀번호는 무작위 32자로 교체했고 값은 `.env.local`에만 있다(gitignore 대상). 남은 위험은 "관리자 계정이 존재한다" 자체이므로 삭제·권한 하향은 배포 시점에 판단한다
  - 참조: e2e·통합 테스트 실행용이고 셋 다 `is_admin = true`다(게임 액션 rate limit 면제 목적 — [`docs/12-handoff.md`](docs/12-handoff.md) "참고 — 로컬 개발 환경")

---

## Notes

- **문서 정본**: 설계·프로토콜은 `docs/`, 실제 구현은 `src/`와 `drizzle/schema.ts`를 따른다. 완료 이력은 Git 커밋에서 확인한다.
- **미확정 표시**: 항목에 `미확정`이 붙어 있으면 구현 전에 사용자 확정이 필요하다.
- **고정 뷰포트 규약**: 새 목록·조회 화면은 `FixedPage` + `usePagedRows`를 쓰고 문서 스크롤을 만들지 않는다. `main`에 `fixed-page` 클래스가 없으면 제약이 조용히 무력화된다 — 규약과 함정은 [`docs/12-handoff.md`](docs/12-handoff.md) 11번.
- **테스트 세 층**: 단위(`pnpm test`, 기본), Server Action 통합(`test/integration/`, `.env.local`의 `INTEGRATION_DB=true`일 때만 — 실제 DB에 쓴다), e2e(`pnpm test:e2e`, 방을 만드는 스펙은 `E2E_ENABLE_ROOM_LIFECYCLE=true`와 계정 두 개 필요). 통합·e2e가 남기는 데이터와 그 이유는 [`docs/12-handoff.md`](docs/12-handoff.md) "참고 — 로컬 개발 환경".
