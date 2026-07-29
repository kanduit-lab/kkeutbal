# TODO

실행 단위의 미완료 작업만 관리한다. 제품 단계·우선순위 원칙은
[`docs/09-roadmap.md`](docs/09-roadmap.md)가 소유한다.

## Priority

### High — 라이브 경로 검증

- [ ] **섯다 검증 배분 실환경 E2E**: 구현된 commit-reveal 시드·개인 손패·종료 후 공개 검증을 전용 두 계정으로 실제 실행
  - 변경 범위: `e2e/authenticated-room.spec.ts` 실행 환경과 검증 활동
  - 완료 기준: `E2E_ENABLE_ROOM_LIFECYCLE=true` + 두 전용 계정에서 시드 제출·봉인·손패·종료 후 deck 재계산이 통과
  - 참조: `docs/10-virtual-credit-and-fair-play.md`

- [ ] **실배포 2기기 스모크 1회**: 배포된 앱에서 전체 플로우를 엔드투엔드로 완주
  - 변경 범위: 검증 활동. 발견한 결함은 별도 구현 작업으로 분리
  - 완료 기준: 로그인 → 방 생성·입장 → 베팅·동기화 → 판 종료·정산 → 랭킹을 실제 기기 2대로 완주하고 Broadcast 왕복 p95를 기록
  - 참조: `docs/09-roadmap.md`, `docs/03-realtime-protocol.md`

- [ ] **실물 화투 리허설**: 실제 화투 3판 이상을 앱 기록과 대조
  - 변경 범위: 검증 활동
  - 완료 기준: 콘솔·DB 직접 수정 없이 완주하고 한 손 조작·어두운 조명·네트워크 복귀를 확인
  - 참조: `docs/09-roadmap.md`

### Medium — 자동화

- [ ] **인증 후 E2E 흐름 확장**: 공개 화면 모바일 스모크 다음으로 실제 방 흐름을 자동화
  - 변경 범위: `e2e/`, 테스트용 가입코드·계정 fixture
  - 완료 기준: 2컨텍스트 동기화, 재접속 복원, 정산 흐름에서 `pnpm test:e2e` 통과. 수동/verified 방 수명주기 spec은 추가됐고 전용 자격 증명 실행만 남음
  - 참조: `playwright.config.ts`, `e2e/public-surfaces.spec.ts`

- [ ] **역할별 렌더링 자동 검증**: 같은 방을 보는 관전자·일반 참가자·딜러·방장이 각각 무엇을 보는지 자동으로 확인
  - 변경 범위: `e2e/`, 또는 `vitest.config.ts`에 렌더링 환경(jsdom 계열)과 `@testing-library` 도입
  - 완료 기준: 게임 종류(`seotda`/`gostop`/`poker`) × 역할 조합에서 판 진행 중 화면이 비지 않는 것을 검증. 최소한 고스톱 방의 비딜러 참가자가 대기 상태를 설명하는 표면을 받는지 확인
  - 참조: `src/features/game/components/room-client.tsx`(`isBettingGame`·`canBet`·`isDealer` 분기), `vitest.config.ts`(현재 `environment: 'node'`라 컴포넌트를 렌더링하지 않음)

- [ ] **데스크톱 뷰포트 E2E 프로젝트 추가**: Playwright가 모바일 폭만 띄우는 상태를 해소
  - 변경 범위: `playwright.config.ts`의 `projects`
  - 완료 기준: 데스크톱 폭 프로젝트가 추가되고, 공개 화면 spec이 모바일·데스크톱 양쪽에서 통과. 2026-07-29 감사가 1280px에서 잡은 좌석 넘침 유형이 자동으로 걸린다
  - 참조: `playwright.config.ts`(현재 `mobile-chromium`(Pixel 7) 단일 프로젝트), `src/features/game/components/game-table.tsx`

- [ ] **고스톱 판 사이 화면 채우기**: 판이 끝나고 다음 판이 깔리기 전(`snapshot.currentRound`가 null) 비딜러 참가자 화면이 여전히 빈다
  - 변경 범위: `src/features/game/components/room-client.tsx`(`showGostopWait` 조건), `src/features/game/components/gostop-wait-panel.tsx`, `src/lib/i18n/dictionaries/`
  - 완료 기준: 고스톱 방에서 판 진행 중이 아닐 때도 비딜러가 다음 동작 주체를 알 수 있다. 섯다·포커의 `actionBar.noRound`와 같은 역할
  - 참조: 2026-07-29 감사에서 대기 표면을 붙이며 발견. 판 진행 중 구간만 처리했다

### Low — 구조적 후속 개선

- [ ] **Server Action 상태머신 통합 테스트**: 순수 엔진 외에 방 잠금·권한·판 참가 스냅샷의 DB 경로 검증이 필요
  - 변경 범위: `features/game/**`, `features/betting/**`, DB 테스트 harness
  - 완료 기준: 누적 베팅 재레이즈, 판중 퇴장·강퇴 거부, 승인 순서, 동시 start/bet 요청을 실제 DB 트랜잭션으로 검증

## Notes

- **문서 정본**: 설계·프로토콜은 `docs/`, 실제 구현은 `src/`와 `drizzle/schema.ts`를 따른다. 완료 이력은 Git 커밋과 문서 Change History에서 확인한다.
- **2026-07-29 UI 감사**: 좌석 배치, 고스톱 비딜러 화면, 헤더/로케일 스위처, 순손익 단위 라벨, 지갑 빈 상태, 관리자 거부 화면의 `admin` 토큰 노출은 같은 날 수정했으므로 여기 열지 않았다. 위에 남긴 세 항목은 결함 자체가 아니라 그것들이 수동 감사까지 살아남은 이유(렌더링·뷰포트 자동 검증 부재)와, 이번에 처리 범위 밖이던 판 사이 구간을 다룬다. 우선순위 배경은 [`docs/09-roadmap.md`](docs/09-roadmap.md).
