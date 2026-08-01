# TODO

**코드로 끝낼 수 있는 작업만** 관리한다. 실기기·실배포·실물 리허설처럼 사람이 물건을 들고
해야 하는 확인은 여기 열지 않는다 — 순서와 근거는 [`docs/09-roadmap.md`](docs/09-roadmap.md)가,
미확정 설계 질문은 [`docs/12-handoff.md`](docs/12-handoff.md)가 소유한다.

## Priority

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
