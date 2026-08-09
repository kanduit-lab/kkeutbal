# TODO

**코드로 끝낼 수 있는 작업만** 관리한다. 실기기·실배포·실물 리허설처럼 사람이 물건을 들고
해야 하는 확인은 여기 열지 않는다 — 순서와 근거는 [`docs/09-roadmap.md`](docs/09-roadmap.md)가,
미확정 설계 질문은 [`docs/12-handoff.md`](docs/12-handoff.md)가 소유한다.

## Priority

### 운영

- [ ] **테스트 계정 정리**: `testadmin1`/`testadmin2`/`testadmin3`을 배포 전에 없애거나 권한을 내린다
  - 변경 범위: DB(`users`), `.env.local`의 `DEV_*_USERNAME`/`DEV_*_PASSWORD`(아무 코드도 읽지 않는다 — 사람이 로그인할 때 쓰는 비밀번호의 유일한 사본)
  - 완료 기준: 실 사용 DB에 테스트용 관리자 계정이 남아 있지 않다
  - 현재 상태: 비밀번호는 무작위 32자로 교체했고 값은 `.env.local`에만 있다(gitignore 대상). 남은 위험은 "관리자 계정이 존재한다" 자체이므로 삭제·권한 하향은 배포 시점에 판단한다
  - 참조: 통합 테스트 실행용이고 셋 다 `is_admin = true`다(게임 액션 rate limit 면제 목적 — [`docs/12-handoff.md`](docs/12-handoff.md) "참고 — 로컬 개발 환경")

---

## Notes

- **문서 정본**: 설계·프로토콜은 `docs/`, 실제 구현은 `src/`와 `drizzle/schema.ts`를 따른다. 완료 이력은 Git 커밋에서 확인한다.
- **미확정 표시**: 항목에 `미확정`이 붙어 있으면 구현 전에 사용자 확정이 필요하다.
- **고정 뷰포트 규약**: 새 목록·조회 화면은 `FixedPage` + `usePagedRows`를 쓰고 문서 스크롤을 만들지 않는다. `main`에 `fixed-page` 클래스가 없으면 제약이 조용히 무력화된다 — 규약과 함정은 [`docs/12-handoff.md`](docs/12-handoff.md) 11번.
- **테스트 두 층**: 단위·컴포넌트(`pnpm test` — 순수 함수는 node, `test/dom/**`은 jsdom), Server Action 통합(`test/integration/`, `.env.local`의 `INTEGRATION_DB=true`일 때만 — 실제 DB에 쓴다). 통합 테스트가 남기는 데이터와 그 이유는 [`docs/12-handoff.md`](docs/12-handoff.md) "참고 — 로컬 개발 환경".
- **브라우저 검증은 자동화돼 있지 않다**: Playwright e2e를 걷어냈으므로(2026-08-09) 실제 브라우저에서만 드러나는 회귀 — 스크롤 가능 여부, 겹친 요소가 탭을 가로채는 것, 문서 스크롤 — 는 사람이 직접 보는 수밖에 없다. UI를 건드리면 해당 화면을 폰·데스크톱 폭에서 눈으로 확인한다.
