# TODO

실행 단위의 미완료 작업만 관리한다. 제품 단계·우선순위 원칙은
[`docs/09-roadmap.md`](docs/09-roadmap.md)가 소유한다.

## Priority

### High — 라이브 경로 검증

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
  - 완료 기준: 2컨텍스트 동기화, 재접속 복원, 정산 흐름에서 `pnpm test:e2e` 통과
  - 참조: `playwright.config.ts`, `e2e/public-surfaces.spec.ts`

### Low — 구조적 후속 개선

- [ ] **칩 정수 정밀도 경계 확정**: DB `bigint` 합계를 화면·액션에서 `number`/`float8`로 전달해 안전 정수 범위를 넘으면 정밀도가 사라질 수 있음
  - 변경 범위: `drizzle/schema.ts`, `features/game/**`, `features/ranking/**`, API 뷰 타입
  - 완료 기준: bigint 문자열 직렬화 또는 방·사용자 누적 상한을 서버/DB 양쪽에서 강제하고 경계 테스트 통과

- [ ] **Server Action 상태머신 통합 테스트**: 순수 엔진 외에 방 잠금·권한·판 참가 스냅샷의 DB 경로 검증이 필요
  - 변경 범위: `features/game/**`, `features/betting/**`, DB 테스트 harness
  - 완료 기준: 누적 베팅 재레이즈, 판중 퇴장·강퇴 거부, 승인 순서, 동시 start/bet 요청을 실제 DB 트랜잭션으로 검증

- [ ] **관리자·Vision 오류 i18n 전환**: `auth/admin-actions.ts`와 `jokbo-advisor/vision/actions.ts`의 한국어 원문 오류를 사전 키로 통일
  - 변경 범위: 관리자·어드바이저 액션 및 ko/en 사전
  - 완료 기준: 모든 Server Action 오류가 안정된 `errors.*` 키로 반환되고 영어 화면에서도 번역됨

- [ ] **전광판 박 표시**: 종료 판의 `RecentRoundView.penalties`를 모니터 화면에도 노출
  - 변경 범위: `monitor-client.tsx`
  - 완료 기준: 피박·광박·복합 박이 결과 페이지와 같은 표기로 표시됨

## Notes

- **문서 정본**: 설계·프로토콜은 `docs/`, 실제 구현은 `src/`와 `drizzle/schema.ts`를 따른다. 완료 이력은 Git 커밋과 문서 Change History에서 확인한다.
