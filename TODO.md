# TODO

단계 구분과 MVP 경계는 [`docs/09-roadmap.md`](docs/09-roadmap.md)가 소유한다.
이 파일은 **실행 가능한 잔여 작업**만 추적한다.

## Priority

### High

- [ ] **의존성 설치 및 버전 확정**: `package.json` 의 버전 범위를 실제 최신 안정판으로 맞춘다
  - 변경 범위: 루트 설정
  - 완료 기준: `pnpm install` 성공, `pnpm typecheck` 와 `pnpm lint` 통과
  - 참조: `package.json`. 명시된 버전은 스캐폴드 시점 추정치이므로 설치 시 검증 필요

- [ ] **섯다 기대값 테이블 작성**: 190조합 전수의 족보 기대값을 사람이 직접 작성
  - 변경 범위: `src/features/seotda/seotda.fixtures.ts`
  - 완료 기준: 20장 중 2장 조합 190개 각각에 `label` 과 `rank` 기대값이 채워짐
  - 참조: `docs/04-game-engines.md` 서열표. **엔진 출력으로 생성 금지** — 버그가 고정된다

- [ ] **섯다 엔진 구현**: `evaluateSeotdaHand` · `resolveSeotdaShowdown` · `describeSeotdaHand`
  - 변경 범위: `src/features/seotda/engine.ts`
  - 완료 기준: `engine.test.ts` 의 `it.todo` 전부 실제 테스트로 전환 후 통과, 커버리지 90%+
  - 참조: 기대값 테이블 선행 필요

- [ ] **Authentik OIDC 애플리케이션 등록**: Provider 생성 후 redirect URI 연결
  - 변경 범위: infra (Authentik), `.env.local`
  - 완료 기준: 로컬에서 로그인 왕복 성공, 세션에 `sub` 확인
  - 참조: `docs/07-auth-and-security.md` "Authentik 쪽 설정"

- [ ] **Supabase RLS JWT 브리지 방식 확정**: 서버 단명 JWT 발급 vs third-party auth 설정
  - 변경 범위: docs, `src/lib/auth.ts`, `src/lib/supabase/client.ts`
  - 완료 기준: 결정 후 `docs/07-auth-and-security.md` Open Question 해소, 구현 경로 확정
  - 참조: `docs/01-architecture.md` Open Questions

- [ ] **스키마 반영 및 RLS 적용**: drizzle push 후 RLS SQL 실행
  - 변경 범위: DB
  - 완료 기준: 비참가자 토큰으로 각 테이블 조회 시 0행, `chip_ledger` INSERT 거부 확인
  - 참조: `drizzle/schema.ts`, `supabase/migrations/0001_init_rls.sql`

- [ ] **실시간 지연 조기 측정**: 방 채널 구독 + Broadcast 왕복 시간 측정
  - 변경 범위: `src/lib/realtime/`, 임시 측정 페이지
  - 완료 기준: 2기기 기준 p95 300ms 이내 확인. 초과 시 아키텍처 재검토 판단
  - 참조: `docs/03-realtime-protocol.md` "지연 목표와 측정". 가장 먼저 깨질 가정이라 우선 검증

### Medium

- [ ] **방 생성·입장 플로우**: 코드 생성, QR, 참가자 목록(Presence)
  - 변경 범위: `src/app/rooms/`, `src/features/game/`
  - 완료 기준: 두 계정으로 같은 방 입장, 참가자 목록 실시간 반영
  - 참조: `docs/08-ui-ux.md` 화면 구성

- [ ] **베팅 액션 + 칩 원장**: 낙관적 UI, Server Action 확정, 승인 모드
  - 변경 범위: `src/features/betting/`, `src/features/budget/`
  - 완료 기준: 순손익 합계 0 불변식 검증 통과, 잔액 초과 베팅 이중 차단
  - 참조: `docs/06-features-ranking-budget-betting.md`

- [ ] **족보 Advisor 수동 피커**: 카드 그리드 + 즉시 판정
  - 변경 범위: `src/features/jokbo-advisor/`
  - 완료 기준: 오프라인에서 동작, 결과 수정 탭 2회 이내
  - 참조: `docs/05-jokbo-advisor.md` "경로 1"

- [ ] **정산·랭킹 화면**: 세션 종료 → 순손익 확정 → 랭킹·배지
  - 변경 범위: `src/features/ranking/`, `src/app/rooms/[code]/result/`
  - 완료 기준: 지표 정의와 계산 결과 일치, 참여 0판 승률 `-` 표기
  - 참조: `docs/06-features-ranking-budget-betting.md` 지표 정의표

- [ ] **재접속 복원 경로**: `state.request` / `state.snapshot` 처리
  - 변경 범위: `src/lib/realtime/`
  - 완료 기준: 소켓 강제 종료 후 재입장 시 칩·판 상태 완전 일치
  - 참조: `docs/03-realtime-protocol.md` "재연결 복원"

- [ ] **화투 카드 이미지 에셋 확보**: 직접 제작 또는 오픈 라이선스 확인
  - 변경 범위: `public/cards/`
  - 완료 기준: 48장 에셋 확보 + 라이선스 근거 기록
  - 참조: `docs/08-ui-ux.md` Open Questions

### Low

- [ ] **사진 인식(vision) 파이프라인**: 리사이즈 → 업로드 → Claude vision → zod 파싱
  - 변경 범위: `src/features/jokbo-advisor/vision/`
  - 완료 기준: 인식을 꺼도 앱 100% 동작, 스키마 이탈 시 부분 반영 0건
  - 참조: `docs/05-jokbo-advisor.md` "경로 2"

- [ ] **고스톱 점수 엔진**: `captureOf` · `scoreGostop` · `hasChongtong`
  - 변경 범위: `src/features/gostop/scoring.ts`
  - 완료 기준: 경계값(4/5/9/10장)·배수 조합 테스트 통과, `breakdown` 근거 표시
  - 참조: `docs/04-game-engines.md` "고스톱 엔진"

- [ ] **E2E 테스트**: 2컨텍스트 동기화·재접속·정산
  - 변경 범위: `e2e/`
  - 완료 기준: `pnpm test:e2e` 통과
  - 참조: `docs/01-architecture.md` Verification Plan

- [ ] **실물 리허설**: 실제 화투로 3판 이상 진행
  - 변경 범위: 없음 (검증 활동)
  - 완료 기준: 개발자 콘솔·DB 직접 수정 없이 완주
  - 참조: `docs/09-roadmap.md` Phase 9

---

## Completed

### 스캐폴드

- [x] 저장소 초기화 및 표준 구조 생성: Next.js App Router 기준 디렉터리, 설정 파일, 라이선스
  - `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `vitest.config.ts`,
    `drizzle.config.ts`, `postcss.config.mjs`, `.env.example`
  - `master` 에 `.gitignore` 만 담은 초기 커밋 후 `develop` 분기

- [x] 설계 문서 10종 작성: 개요·아키텍처·데이터 모델·실시간 프로토콜·게임 엔진·Advisor·기능 스펙·인증·UI/UX·로드맵
  - `docs/00-overview.md` ~ `docs/09-roadmap.md`
  - 각 문서에 type/audience/status/source-of-truth 메타데이터 명시

- [x] 화투 48장 카드 모델 구현: 월별 명세에서 덱 파생, 섯다 20장 부분집합 도출
  - `src/features/hwatu/cards.ts`, `types.ts`
  - 검증: `cards.test.ts` — 48장 구성, 광 5장, 열끗 9장, 띠 10장, 피 24장, 고도리 3장,
    쌍피 2장, 섯다 덱 20장 및 월별 2장 불변식

- [x] 도메인 타입·서열 상수 정의: 섯다 족보 서열, 고스톱 룰 프리셋, 실시간 이벤트 스키마
  - `src/features/seotda/types.ts`, `src/features/gostop/types.ts`, `src/lib/realtime/events.ts`
  - 엔진 구현체는 스텁이며 Phase 1·8 대상

- [x] DB 스키마 및 RLS 정책 작성: 칩 원장 append-only 구조, 방 격리 정책, realtime 채널 권한
  - `drizzle/schema.ts`, `supabase/migrations/0001_init_rls.sql`
  - 미적용 상태 — 실제 DB 반영은 High 항목에서 수행

---

## Notes

- **엔진 스텁**: `seotda/engine.ts` 와 `gostop/scoring.ts` 는 호출 시 명시적으로 오류를 던진다.
  조용히 잘못된 값을 반환하지 않게 하려는 의도이며, 각각 Phase 1·8에서 대체된다.
- **테스트 미실행**: 스캐폴드 시점에 의존성이 설치되지 않아 `pnpm test` 를 돌리지 않았다.
  카드 모델 테스트는 작성만 되어 있으며 첫 설치 후 실행해 확인할 것.
- **버전 추정치**: `package.json` 의 의존성 버전은 스캐폴드 시점 기준 추정이다. 설치 시 확정한다.
- **설계 결정 기록**: `docs/design-decisions/` 는 git 미추적이다 (`.gitignore`).
- **빌드 실행**: `pnpm build` 등 무거운 빌드는 사용자가 실행한다. 자세한 분업은 `CLAUDE.md`.
