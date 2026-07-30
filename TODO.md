# TODO

실행 단위의 미완료 작업만 관리한다. 제품 단계와 우선순위 순서·근거는
[`docs/09-roadmap.md`](docs/09-roadmap.md)가, 각 항목의 조사 근거와 미확정 설계 질문은
[`docs/12-handoff.md`](docs/12-handoff.md)가 소유한다.

## Priority

### High — 판 진행 정확성

- [ ] **서버 턴 검증**: 자기 차례가 아닌 사람의 베팅이 그대로 accepted 되는 상태를 막는다
  - 변경 범위: `src/features/betting/actions.ts`(`validateBetSemantics`), `src/features/betting/round-bet-state.ts`, `src/features/game/components/action-bar.tsx`
  - 완료 기준: 차례가 아닌 사용자의 `placeBet`이 거부된다. 같은 검증이 `approveBet`(대리 베팅 승인)에도 걸린다. 턴 판정이 순수 함수로 분리돼 서버와 클라이언트가 같은 함수를 쓴다. 클라이언트만 고치면 API 직접 호출로 우회되므로 서버가 먼저다
  - 참조: [`docs/12-handoff.md`](docs/12-handoff.md) 8번. 턴 계산은 현재 `game-table.tsx`의 `nextActorId` 하나뿐이고 좌석 하이라이트 표시에만 쓰인다
  - 선행 확인: `nextActorId`의 좌석 순서 기준이 실제 섯다·포커 베팅 순서와 맞는지 먼저 검증

- [ ] **판 자동 종료**: 전원 콜 완료와 전원 다이를 감지해 판을 끝낸다
  - 변경 범위: `src/features/betting/actions.ts`, `src/features/game/round-actions.ts`, `src/lib/realtime/` 이벤트 정의
  - 완료 기준: fold하지 않은 전원의 누적 베팅이 같아지면 쇼다운 단계로 넘어간다. fold 안 한 사람이 1명 남으면 그 사람이 승자로 확정된다. 딜러가 "🏁 종료"를 수동으로 누르지 않아도 된다
  - 참조: [`docs/12-handoff.md`](docs/12-handoff.md) 9번
  - 선행: 위 서버 턴 검증. 턴 순서가 강제되지 않으면 "한 바퀴 돌았다"를 판정할 수 없다
  - 미확정: 사용자가 말한 "다음 세션"이 판(round) 전환인지 새 상위 단위인지 확인 필요. 이 저장소에서 "세션"은 이미 방 하나를 뜻한다

- [ ] **섯다 레이즈 배수·상한 규칙**: 따당·하프·풀이 입력 편의 프리셋일 뿐 서버가 강제하지 않는다
  - 변경 범위: `src/features/game/actions.ts`(`rulePreset`), `src/features/betting/round-bet-state.ts`, `src/features/betting/actions.ts`, `src/lib/i18n/dictionaries/`
  - 완료 기준: 방 생성 시 고른 레이즈 규칙이 서버에서 강제된다. 규칙 위반 시 전용 에러 문구가 뜬다
  - 참조: [`docs/12-handoff.md`](docs/12-handoff.md) 5번
  - 미확정: 어떤 규칙을 쓸지 사용자 확정 필요 — 따당 강제, pot-limit, 방별 하우스 룰 선택 중

### High — 통신 안정성

- [ ] **재구독 트리거 확대**: `CHANNEL_ERROR`·`TIMED_OUT`에서 재구독이 걸리지 않는다
  - 변경 범위: `src/features/game/components/use-room-sync.ts`
  - 완료 기준: `CLOSED` 외의 실패 상태에서도 백오프 재구독이 예약된다. 백오프에 지터가 들어가 10인방이 동시에 재접속하지 않는다
  - 참조: [`docs/12-handoff.md`](docs/12-handoff.md) 12번

- [ ] **스냅샷 refetch 타임아웃**: 폴링·이벤트 유래 `refreshRoom`이 무기한 대기한다
  - 변경 범위: `src/features/game/components/use-room-sync.ts`
  - 완료 기준: `refetch`가 `src/lib/with-timeout.ts`로 상한을 갖고, 타임아웃이 연결 실패와 같은 표면으로 드러난다. `runAction`의 15초 레이스와 값이 어긋나지 않는다
  - 참조: [`docs/12-handoff.md`](docs/12-handoff.md) 12번

- [ ] **broadcast 전송 실패 처리**: `channel.send`가 fire-and-forget이라 이벤트가 조용히 사라진다
  - 변경 범위: `src/lib/realtime/client.ts`, `src/features/game/components/room-client.tsx`(`afterMutation`)
  - 완료 기준: 전송 실패를 감지해 재시도하거나, 최소한 행동한 클라이언트가 "남들에게 안 갔을 수 있다"를 알 수 있다. Server Action은 성공했는데 남의 화면만 20초 늦는 구간이 없어진다
  - 참조: [`docs/12-handoff.md`](docs/12-handoff.md) 12번. 수신자가 진실을 스냅샷으로 확인하는 원칙은 [`docs/03-realtime-protocol.md`](docs/03-realtime-protocol.md)

- [ ] **이벤트 중복 배달 제거**: envelope `id`를 쓰지 않아 재접속 시 소리·토스트가 두 번 난다
  - 변경 범위: `src/lib/realtime/client.ts` 또는 `use-room-event-feedback.ts`
  - 완료 기준: 최근에 본 `id`를 기억해 같은 이벤트의 두 번째 배달은 피드백을 내지 않는다. 스냅샷 refetch는 그대로 둔다
  - 참조: [`docs/12-handoff.md`](docs/12-handoff.md) 12번

### High — 모바일 방 화면

- [ ] **모바일 방 화면 실기기 확인**: 딜러 시트 구조를 실제 폰에서 검증한다
  - 변경 범위: 검증 활동. 발견한 결함은 별도 구현 작업으로 분리
  - 완료 기준: 딜러 겸 방장 계정으로 2인방과 10인방 양쪽에서 판 종료·판 무효가 스크롤 없이 닿는다. 세로 짧은 기기(iPhone SE급)에서 `GameTable`이 0 높이로 눌리지 않는다. 승인 대기 배지 숫자가 시트를 열지 않아도 보인다
  - 참조: [`docs/12-handoff.md`](docs/12-handoff.md) 4번. 구현은 끝났고 남은 것은 실기기 확인뿐이다

- [ ] **고스톱 판 사이 화면 채우기**: 판이 끝나고 다음 판이 깔리기 전 비딜러 화면이 빈다
  - 변경 범위: `src/features/game/components/room-client.tsx`(`showGostopWait`), `gostop-wait-panel.tsx`, `src/lib/i18n/dictionaries/`
  - 완료 기준: 고스톱 방에서 판 진행 중이 아닐 때도 비딜러가 다음 동작 주체를 안다. 섯다·포커의 `actionBar.noRound`와 같은 역할
  - 참조: 2026-07-29 UI 감사에서 대기 표면을 붙이며 발견. 판 진행 중 구간만 처리했다

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

### Medium — 흐름 연결

- [ ] **계정 설정 페이지**: 가입 후 표시 이름을 바꿀 방법이 없다
  - 변경 범위: 새 라우트 `src/app/settings/`, `src/features/auth/`(프로필 액션), `src/lib/i18n/dictionaries/`
  - 완료 기준: 본인이 `displayName`을 바꾸면 랭킹·방 표시에 반영된다. 게스트 계정은 `authentikSub`이 이름과 묶여 있어 제외하거나 별도 처리
  - 참조: [`docs/12-handoff.md`](docs/12-handoff.md) 3번
  - 미확정: 아바타·전화번호까지 포함할지. 전화번호는 본인 인증 없이 바꾸면 계정 탈취 경로가 된다

### Medium — 화면 완성도

- [ ] **모바일 가로 모드 방 화면**: 세로 기준으로만 반응형이 짜여 있다
  - 변경 범위: `src/app/manifest.ts`(`orientation`), `src/features/game/components/game-table.tsx` 좌석 배치
  - 완료 기준: 방 화면이 가로에서 좌우로 퍼진 배치를 쓴다. 실기기 iOS·Android 양쪽에서 회전 동작 확인
  - 참조: [`docs/12-handoff.md`](docs/12-handoff.md) 6번. 위 방 화면 세로 길이 항목과 같은 화면이라 함께 설계
  - 미확정: 가로를 강제할지, 어느 화면까지 대응할지, PWA manifest를 바꿀지 사용자 확정 필요

### Low — 회귀 가드

- [ ] **역할별 렌더링 검증**: 같은 방을 보는 관전자·참가자·딜러·방장이 각각 무엇을 보는지 자동 확인
  - 변경 범위: `vitest.config.ts`에 렌더링 환경 도입, 또는 `e2e/`
  - 완료 기준: 게임 종류 × 역할 조합에서 판 진행 중 화면이 비지 않는 것을 검증
  - 참조: `vitest.config.ts`는 현재 `environment: 'node'`라 컴포넌트를 렌더링하지 않는다

- [ ] **데스크톱 뷰포트 E2E 프로젝트**: Playwright가 모바일 폭만 띄운다
  - 변경 범위: `playwright.config.ts`의 `projects`
  - 완료 기준: 공개 화면 spec이 모바일·데스크톱 양쪽에서 통과
  - 참조: 현재 `mobile-chromium`(Pixel 7) 단일 프로젝트

- [ ] **인증 후 E2E 흐름 확장**: 2컨텍스트 동기화·재접속 복원·정산 흐름 자동화
  - 변경 범위: `e2e/`, 테스트용 가입코드·계정 fixture
  - 완료 기준: 위 세 흐름에서 `pnpm test:e2e` 통과

- [ ] **Server Action 상태머신 통합 테스트**: 방 잠금·권한·판 참가 스냅샷의 DB 경로 검증
  - 변경 범위: `features/game/**`, `features/betting/**`, DB 테스트 harness
  - 완료 기준: 누적 베팅 재레이즈, 판중 퇴장·강퇴 거부, 승인 순서, 동시 start/bet 요청을 실제 DB 트랜잭션으로 검증

---

## Notes

- **문서 정본**: 설계·프로토콜은 `docs/`, 실제 구현은 `src/`와 `drizzle/schema.ts`를 따른다. 완료 이력은 Git 커밋에서 확인한다.
- **미확정 표시**: 항목에 `미확정`이 붙어 있으면 구현 전에 사용자 확정이 필요하다.
- **2026-07-29 UI 감사**: 좌석 배치, 고스톱 비딜러 화면, 헤더·로케일 스위처, 순손익 단위 라벨, 지갑 빈 상태, 관리자 거부 화면의 원문 role 토큰은 같은 날 수정했으므로 여기 열지 않았다.
- **고정 뷰포트 규약**: 새 목록·조회 화면은 `FixedPage` + `usePagedRows`를 쓰고 문서 스크롤을 만들지 않는다. 규약과 주의점은 [`docs/12-handoff.md`](docs/12-handoff.md) 11번.
