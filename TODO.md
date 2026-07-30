# TODO

실행 단위의 미완료 작업만 관리한다. 제품 단계와 우선순위 순서·근거는
[`docs/09-roadmap.md`](docs/09-roadmap.md)가, 각 항목의 조사 근거와 미확정 설계 질문은
[`docs/12-handoff.md`](docs/12-handoff.md)가 소유한다.

## Priority

### High — 모바일 방 화면

- [ ] **턴 강제·자동 종료 실판 확인**: 서버가 차례를 강제하고 판이 저절로 끝나는 흐름을 실제 게임으로 검증한다
  - 변경 범위: 검증 활동. 발견한 결함은 별도 구현 작업으로 분리
  - 완료 기준: 새 판 첫 베팅이 "선"(seatNo 최솟값)에게만 열리는 것이 실제 진행 관행과 맞는다. 1인 생존은 딜러 클릭 없이 끝난다. 검증 딜 방의 콜 완료 쇼다운이 자동 확정되는 속도가 카드 공개 연출을 해치지 않는다. 비검증 방에서 승자 확정 폼이 저절로 열리는 타이밍이 자연스럽다. 레이즈 규칙 3종(`free`/`ttadang`/`pot_limit`)이 프리셋 버튼 계산과 어긋나 보이지 않는다
  - 참조: [`docs/12-handoff.md`](docs/12-handoff.md) 8·9·5번. 이 앱에는 딜러 버튼 로테이션이 없어 "선"이 seatNo 최솟값으로 고정이다 — 로테이션이 필요하면 스키마 필드가 따로 있어야 한다
  - 미확정: 승인 모드(딜러 승인) 방에서 턴 강제와 대리 베팅이 겹칠 때의 순서

- [ ] **모바일 방 화면 실기기 확인**: 딜러 시트 구조를 실제 폰에서 검증한다
  - 변경 범위: 검증 활동. 발견한 결함은 별도 구현 작업으로 분리
  - 완료 기준: 딜러 겸 방장 계정으로 2인방과 10인방 양쪽에서 판 종료·판 무효가 스크롤 없이 닿는다. 세로 짧은 기기(iPhone SE급)에서 `GameTable`이 0 높이로 눌리지 않는다. 승인 대기 배지 숫자가 시트를 열지 않아도 보인다
  - 참조: [`docs/12-handoff.md`](docs/12-handoff.md) 4번. 구현은 끝났고 남은 것은 실기기 확인뿐이다

### High — 실경로 검증

- [ ] **실배포 2기기 스모크**: 배포된 앱에서 전체 플로우를 실기기 2대로 완주
  - 변경 범위: 검증 활동. 발견한 결함은 별도 구현 작업으로 분리
  - 완료 기준: 로그인 → 방 생성·입장 → 베팅·동기화 → 판 종료·정산 → 랭킹을 완주하고 Broadcast 왕복 p95를 기록
  - 참조: [`docs/03-realtime-protocol.md`](docs/03-realtime-protocol.md)

- [ ] **실물 화투 리허설**: 실제 화투 3판 이상을 앱 기록과 대조
  - 변경 범위: 검증 활동
  - 완료 기준: 콘솔·DB 직접 수정 없이 완주하고 한 손 조작·어두운 조명·네트워크 복귀를 확인

- [ ] **섯다 검증 배분 실환경 확인**: commit-reveal 시드·개인 손패·종료 후 공개 검증을 실제로 돌린다
  - 변경 범위: `e2e/authenticated-room.spec.ts` 실행 환경과 검증 활동
  - 완료 기준: `E2E_ENABLE_ROOM_LIFECYCLE=true` + 전용 계정 2개에서 시드 제출·봉인·손패·종료 후 deck 재계산이 통과
  - 참조: [`docs/10-virtual-credit-and-fair-play.md`](docs/10-virtual-credit-and-fair-play.md)

### High — DB · 보안

- [ ] **게임 액션 rate limit**: 방·로컬 멤버 생성이 무제한이다
  - 변경 범위: `src/features/game/actions.ts`(`createRoom`, `joinRoom`), `src/features/game/member-actions.ts`(`addLocalMember`), `src/features/budget/actions.ts`(`addBuyIn`)
  - 완료 기준: 생성 경로가 사용자 단위 창 제한을 받는다. `addLocalMember`는 호출마다 `users` 행을 만들므로 특히 좁게 잡는다. **`placeBet`에는 붙이지 않는다** — 이미 방 단위 advisory lock으로 직렬화돼 있고, 한도를 잘못 잡으면 빠른 판에서 정상 베팅이 막힌다
  - 참조: [`docs/12-handoff.md`](docs/12-handoff.md) 14번

- [ ] **SSO 계정 연결 흐름**: 아이디 기반 자동 병합을 막은 뒤 대체 경로가 없다
  - 변경 범위: 새 라우트 또는 `/account`, `src/lib/auth.ts`, `src/features/auth/`
  - 완료 기준: 로그인한 상태에서 본인이 SSO 계정을 연결한다. 세션 주체가 확실하므로 IdP 클레임을 신뢰할 필요가 없다. 내부 계정으로 가입한 사람이 SSO로 들어와도 계정이 갈라지지 않는다
  - 참조: [`docs/12-handoff.md`](docs/12-handoff.md) 13번
  - 미확정: Authentik이 `phone_number_verified`를 실제로 발급하는지 — 발급하지 않으면 자동 연결은 사실상 꺼진 상태다

### Medium — 정합성 정리

- [ ] **배선되지 않은 크레딧 검증 모듈**: `credit-room.ts`·`wallet/ledger.ts`를 아무도 부르지 않는다
  - 변경 범위: `src/features/game/credit-room.ts`, `src/features/wallet/ledger.ts`, 또는 이들을 부르도록 각 Server Action
  - 완료 기준: 실제 경로가 이 모듈을 거치거나, SQL RPC 중심으로 확정하고 모듈·테스트를 지운다. "테스트로 보장된 검증"처럼 보이면서 프로덕션에 효과가 없는 상태가 사라진다
  - 참조: [`docs/12-handoff.md`](docs/12-handoff.md) 15번. 정합성 자체는 `supabase/migrations/0009~0013`의 SQL 함수가 지킨다

- [ ] **`undoLastBuyIn` 레거시 매칭 제거**: `refBuyInId IS NULL` 폴백이 감사 사슬을 어긋나게 할 수 있다
  - 변경 범위: `src/features/budget/actions.ts`
  - 완료 기준: 폴백 분기가 사라지고 되돌리기가 정확한 원장 행만 가리킨다. 칩 계산은 지금도 정확하다
  - 참조: [`docs/12-handoff.md`](docs/12-handoff.md) 16번
  - 선행 확인: 운영 DB에 `refBuyInId IS NULL`인 `buy_in` 원장 행이 남아 있는지

### Low — 회귀 가드

- [ ] **인증 후 E2E 흐름 확장**: 2컨텍스트 동기화·재접속 복원·정산 흐름 자동화
  - 변경 범위: `e2e/`, 테스트용 가입코드·계정 fixture
  - 완료 기준: 위 세 흐름에서 `pnpm test:e2e` 통과
  - 현재 상태: 문서 스크롤 불변식(`e2e/fixed-viewport.spec.ts`), 스크린샷 수집(`e2e/screenshots.spec.ts`), 모바일·데스크톱 두 프로젝트는 들어갔다. 방 화면 단정은 `authenticated-room.spec.ts`의 lifecycle 테스트에 얹혀 있고 `E2E_ENABLE_ROOM_LIFECYCLE=true`와 계정 2개가 필요하다 — 실행은 실제 DB에 방을 만든다

- [ ] **Server Action 상태머신 통합 테스트**: 방 잠금·권한·판 참가 스냅샷의 DB 경로 검증
  - 변경 범위: `features/game/**`, `features/betting/**`, DB 테스트 harness
  - 완료 기준: 누적 베팅 재레이즈, 판중 퇴장·강퇴 거부, 승인 순서, 동시 start/bet 요청을 실제 DB 트랜잭션으로 검증

---

## Notes

- **문서 정본**: 설계·프로토콜은 `docs/`, 실제 구현은 `src/`와 `drizzle/schema.ts`를 따른다. 완료 이력은 Git 커밋에서 확인한다.
- **미확정 표시**: 항목에 `미확정`이 붙어 있으면 구현 전에 사용자 확정이 필요하다.
- **2026-07-29 UI 감사**: 좌석 배치, 고스톱 비딜러 화면, 헤더·로케일 스위처, 순손익 단위 라벨, 지갑 빈 상태, 관리자 거부 화면의 원문 role 토큰은 같은 날 수정했으므로 여기 열지 않았다.
- **고정 뷰포트 규약**: 새 목록·조회 화면은 `FixedPage` + `usePagedRows`를 쓰고 문서 스크롤을 만들지 않는다. 규약과 주의점은 [`docs/12-handoff.md`](docs/12-handoff.md) 11번.
