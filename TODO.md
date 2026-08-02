# TODO

**코드로 끝낼 수 있는 작업만** 관리한다. 실기기·실배포·실물 리허설처럼 사람이 물건을 들고
해야 하는 확인은 여기 열지 않는다 — 순서와 근거는 [`docs/09-roadmap.md`](docs/09-roadmap.md)가,
미확정 설계 질문은 [`docs/12-handoff.md`](docs/12-handoff.md)가 소유한다.

## Priority

### Medium

- [ ] **게스트 계정 `테스터` 1건이 로그인 불가인 채 남아 있다**: 삭제가 append-only 보호막에 막힌다
  - 배경: 게스트 sub 계산식이 `guest:{tokenId}:HMAC(기기비밀값 ∥ tokenId ∥ 이름)`으로 바뀌면서 옛 계정은 어느 기기로도 로그인되지 않는다. 되살리는 마이그레이션은 일부러 두지 않았다 — 복구 경로가 곧 공격 경로이기 때문
  - 처리한 것: `모바일점검`(참조 0건)은 크레딧 계정과 함께 삭제했다
  - 막힌 것: `테스터`(`540f7ca7-fac5-4b2e-8176-230d619666a2`)는 **정산 완료된 방**에 바이인 1건(500)과 그에 대응하는 `chip_ledger` 1행을 갖고 있다. `chip_ledger.user_id → users`는 NO ACTION이라 사용자 삭제가 막히고, 그 원장 행 자체는 `chip_ledger_no_update`(`BEFORE DELETE OR UPDATE` → `raise exception`)가 막는다. 지우려면 정산 끝난 방의 원장에서 append-only 보증을 일시적으로 꺼야 한다
  - 완료 기준: 셋 중 하나를 고른다 — (a) 이미 로그인 불가이므로 그대로 둔다, (b) `display_name`만 `(삭제된 게스트)` 류로 바꿔 표시상 정리한다, (c) 트리거를 끄고 원장 행까지 지운다(그 방 정산표에서 참가자 한 명이 사라진다)
  - 참조: 그 방은 이미 `settled`이고 이 계정은 베팅·승리 기록이 없다. 칩 순액 500은 바이인 그 자체다

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
