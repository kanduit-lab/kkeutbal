# TODO

**코드로 끝낼 수 있는 작업만** 관리한다. 실기기·실배포·실물 리허설처럼 사람이 물건을 들고
해야 하는 확인은 여기 열지 않는다 — 순서와 근거는 [`docs/09-roadmap.md`](docs/09-roadmap.md)가,
미확정 설계 질문은 [`docs/12-handoff.md`](docs/12-handoff.md)가 소유한다.

## Priority

### 적용 대기 — 코드는 병합됐고 DB 반영만 남았다

두 마이그레이션 모두 **파일만 작성돼 있고 적용되지 않았다**. 앱 코드는 적용 전 DB에서도
그대로 동작한다(호출하는 RPC 시그니처가 안 바뀌었고, 새 복구 RPC는 아직 호출부가 없다) —
다만 DB 쪽 권위 검사가 없는 동안은 TS 앞단 검사만 남는다.

- [ ] **`supabase/migrations/0018_buy_in_idempotency.sql` 적용**: 바이인 멱등키와 취소 보존식의 DB 쪽 권위
  - 배경: `addBuyIn`이 `requestId`를 `buy_ins.id`로 넣어 PK 충돌 한 번이 `buy_ins`·`chip_ledger`·`room_credit_locks` 세 벌 중복을 동시에 막는다. 이 마이그레이션은 `release_room_credit_buy_in`에 "칩은 남았는데 활성 lock이 없는 사용자가 생기면 거부" 불변식을 넣고, 이미 잠긴 방을 위한 관리자 전용 `admin_repair_room_credit_settlement`를 추가한다
  - 완료 기준: 적용 후 `test/integration/`에 바이인 재전송·취소 거부 케이스를 붙여 통과시킨다 (지금은 적용 전이라 실패하므로 추가하지 않았다)
  - 참조: 현재 프로덕션에 정산이 막힌 방은 0건으로 확인했다

- [ ] **`supabase/migrations/0019_drizzle_ledger_sync_0020.sql` 적용**: 새 환경에서 `drizzle-kit migrate`가 실패하는 지뢰 제거
  - 배경: `0020_lying_leader`(`users.is_managed`)는 supabase 쪽 `add_users_is_managed`로 반영됐지만 `drizzle.__drizzle_migrations`에는 기록되지 않았다. 디스크 journal은 21개(idx 0~20), DB 원장은 20행이다
  - 완료 기준: 적용 후 `select count(*) from drizzle.__drizzle_migrations`가 21이고, `pnpm db:migrate`가 "No migrations to apply"로 끝난다
  - 참조: hash는 기존 20행 전부와 파일 sha256을 대조해 20/20 일치를 확인했다. 절차는 `docs/08-database-migrations.md`의 "원장 동기화"

### Medium

- [ ] **기존 게스트 계정 2개가 어느 기기로도 로그인되지 않는다**: 게스트 sub 계산식이 바뀌면서 생긴 고아 행
  - 배경: 계정 탈취를 막느라 sub를 `guest:{tokenId}:HMAC(기기비밀값 ∥ tokenId ∥ 이름)`으로 바꿨다. 되살리는 마이그레이션은 일부러 두지 않았다 — 복구 경로가 곧 공격 경로이기 때문
  - 현재 상태: 조회 결과 게스트 계정 2개, 진행 중인 방에 있는 게스트 0명, 방장 0명, 칩 기록이 있는 계정 1개. 이미 발급된 세션 JWT는 3일 만료까지는 동작한다
  - 완료 기준: 그 2개 행을 지울지, 이름을 바꿔 보존할지 정하고 실행한다. 칩 기록이 있는 1개는 지우면 그 방 정산 이력이 어그러지는지 먼저 확인한다

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
