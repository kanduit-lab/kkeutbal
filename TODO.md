# TODO

**코드로 끝낼 수 있는 작업만** 관리한다. 실기기·실배포·실물 리허설처럼 사람이 물건을 들고
해야 하는 확인은 여기 열지 않는다 — 순서와 근거는 [`docs/09-roadmap.md`](docs/09-roadmap.md)가,
미확정 설계 질문은 [`docs/12-handoff.md`](docs/12-handoff.md)가 소유한다.

## Priority

### Low — 회귀 가드

- [ ] **재접속·복원 E2E**: 소켓이 끊긴 뒤 상태가 되돌아오는 경로를 자동화한다
  - 변경 범위: `e2e/`
  - 완료 기준: 채널을 강제로 끊었다가 되살렸을 때 스냅샷이 회복되고, 백그라운드에서 돌아올 때(`visibilitychange`) 최신 상태로 맞춰지는 것을 단정한다
  - 현재 상태: 2컨텍스트 동기화(게스트 입장이 호스트 화면에 반영되는 것)와 정산 흐름은 `e2e/authenticated-room.spec.ts`가 이미 덮는다. 끊김·복원만 남았고, 이건 Broadcast 소켓을 테스트에서 어떻게 끊을지부터 정해야 한다

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
