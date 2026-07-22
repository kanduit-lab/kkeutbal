# TODO

단계 구분과 MVP 경계는 [`docs/09-roadmap.md`](docs/09-roadmap.md)가 소유한다.
이 파일은 **실행 가능한 잔여 작업**만 추적한다.

## Priority

### High

- [ ] **Authentik OIDC 애플리케이션 등록**: Provider 생성 후 redirect URI 연결, 실제 로그인 왕복 확인
  - 변경 범위: infra (Authentik), `.env.local` (`AUTH_AUTHENTIK_*` 3종)
  - 완료 기준: Authentik 경로로 로그인 성공, 세션에 `sub` 확인. 현재는 `AUTH_DEV_LOGIN=true` 게스트 로그인(이름만 입력, `dev:{name}` sub)만 동작
  - 참조: `src/features/auth/session.ts`, `docs/07-auth-and-security.md`

- [ ] **섯다 엔진 검증**: `evaluateSeotdaHand` · `resolveSeotdaShowdown`은 구현됐지만 테스트가 비어 있다
  - 변경 범위: `src/features/seotda/engine.test.ts`, 신규 `src/features/seotda/seotda.fixtures.ts`
  - 완료 기준: 190조합(20장 중 2장) 전수 기대값 테이블을 사람이 직접 작성(엔진 출력으로 생성 금지) 후, `engine.test.ts`의 `it.todo` 19건을 실제 테스트로 전환해 전부 통과, 커버리지 90%+
  - 참조: `src/features/seotda/engine.ts`(구현 완료), `docs/04-game-engines.md` 서열표. **구현이 먼저 끝났고 검증이 뒤처진 상태** — 지금 정확도는 코드 리뷰 수준 신뢰밖에 없다

- [ ] **staging 배포 시크릿 구성**: `ENV_FILE_BASE64` 등록 후 `.deploy.yml` staging/preview 활성화
  - 변경 범위: GitHub repo secrets, `.deploy.yml`
  - 완료 기준: `staging.enabled` / `preview.enabled`를 `true`로 전환해도 `develop` 브랜치 배포와 PR 프리뷰가 정상 기동
  - 참조: `.deploy.yml` (현재 둘 다 `enabled: false`로 주석에 사유 명시), `.github/workflows/deploy.yml`

- [ ] **실시간 지연 조기 측정**: 방 채널 구독 + Broadcast 왕복 시간 측정
  - 변경 범위: `src/lib/realtime/`, 임시 측정 페이지
  - 완료 기준: 2기기 기준 p95 300ms 이내 확인. 초과 시 아키텍처 재검토 판단
  - 참조: `docs/03-realtime-protocol.md` "지연 목표와 측정". 로드맵 리스크 순서 1번 — 아직 실측 없음

- [ ] **실기기 리허설**: 모바일 실기기에서 한 손 조작·어두운 조명 조건 확인
  - 변경 범위: 없음 (검증 활동)
  - 완료 기준: room-client 플로우(참가·베팅·족보 조회)를 실기기에서 수동 개입 없이 완주
  - 참조: `docs/09-roadmap.md` Phase 9

- [ ] **실물 판 리허설**: 실제 화투로 3판 이상 진행하며 앱과 대조
  - 변경 범위: 없음 (검증 활동)
  - 완료 기준: 개발자 콘솔·DB 직접 수정 없이 완주
  - 참조: `docs/09-roadmap.md` Phase 9. 위 섯다 엔진 검증 완료 후 진행해야 의미가 있음

### Medium

- [ ] **`hand_records` 저장 연결**: Advisor 판정 결과를 DB에 남기지 않는다
  - 변경 범위: `src/features/jokbo-advisor/`, `src/features/game/actions.ts`
  - 완료 기준: 방 진행 중 Advisor로 판정한 손패가 `hand_records`에 라운드·유저별로 1행 기록(스키마의 `hand_records_round_user_uq` unique 제약 준수)
  - 참조: `drizzle/schema.ts` `hand_records` 테이블(스키마만 존재, 쓰기 경로 없음)

- [ ] **E2E 테스트 스위트**: Playwright 자동화가 아직 없다
  - 변경 범위: `e2e/` (신규)
  - 완료 기준: 2컨텍스트 동기화, 재접속 복원, 정산 흐름에 대해 `pnpm test:e2e` 통과
  - 참조: `package.json`의 `test:e2e` 스크립트는 정의돼 있으나 대상 디렉터리 없음

- [ ] **화투 카드 이미지 에셋 확보**: `public/cards/`가 비어 있다
  - 변경 범위: `public/cards/`
  - 완료 기준: 48장 에셋 확보 + 라이선스 근거 기록
  - 참조: `docs/08-ui-ux.md` Open Questions

- [ ] **고스톱 엔진 테스트**: `captureOf` · `scoreGostop` · `hasChongtong`은 구현됐지만 테스트가 없다
  - 변경 범위: 신규 `src/features/gostop/scoring.test.ts`
  - 완료 기준: 경계값(4/5/9/10장)·배수 조합 테스트 통과, `breakdown` 근거 표시 검증
  - 참조: `src/features/gostop/scoring.ts`(278줄, 구현 완료)

### Low

- [ ] **`groups` / `group_members` 활용 경로**: 스키마만 있고 쓰는 기능이 없다
  - 변경 범위: 범위 미정 — 필요성부터 재확인
  - 완료 기준: 사용 계획 없으면 스키마 제거를 결정하고 마이그레이션 작성, 필요하면 기능 스펙 작성
  - 참조: `drizzle/schema.ts` `groups`, `group_members`

---

## Completed

### 도메인 엔진

- [x] 화투 48장 카드 모델: 월별 명세에서 덱 파생, 섯다 20장 부분집합 도출
  - `src/features/hwatu/cards.ts`, `types.ts`, 검증: `cards.test.ts`

- [x] 섯다 판정 엔진 구현: `evaluateSeotdaHand` · `resolveSeotdaShowdown` · `describeSeotdaHand`
  - `src/features/seotda/engine.ts` — 암행어사·땡잡이·구사 룰 토글, 동급 처리(`replay` / `dealer-wins`) 포함
  - 테스트는 아직 `it.todo` 상태 — High "섯다 엔진 검증" 항목에서 별도 추적

- [x] 고스톱 점수 엔진 구현: `captureOf` · `scoreGostop` · `hasChongtong`
  - `src/features/gostop/scoring.ts` — 분류 집계 → 기본 점수 → 조합 보너스 → 고 가산·배수 → 박 배수 → 선언 배수 순, `breakdown` 근거 포함
  - 테스트는 없음 — Medium "고스톱 엔진 테스트" 항목에서 별도 추적

### 데이터베이스

- [x] Drizzle 스키마 반영 및 RLS 적용: `supabase` MCP로 마이그레이션 3건 실제 적용
  - `init_schema`(drizzle 생성 DDL), `init_rls`(`supabase/migrations/0001_init_rls.sql`), `keep_alive_and_app_grants`(`keep_alive` 테이블 + `kkeutbal_app` 권한)
  - 앱 쓰기는 전용 롤 `kkeutbal_app`(bypassrls)로 Supabase pooler(session mode, aws-1-ap-northeast-2)를 통해 수행. RLS는 anon/authenticated에 대한 방어층이며 앱 자체 권한 검사는 각 Server Action이 담당

- [x] 칩 원장 정합성 구현: append-only 트리거, 정정은 `reverted_of` 역부호 행, 방 단위 `pg_advisory_xact_lock`으로 경쟁 조건 직렬화
  - `src/features/betting/actions.ts`, `src/features/budget/actions.ts`
  - 베팅 멱등키는 클라이언트 UUID를 PK로 사용해 중복 제출 차단

- [x] Supabase 인증 경로 확정: 서비스 롤 키 / JWT 브리지 방식을 쓰지 않기로 결정
  - `docs/01-architecture.md` / `docs/07-auth-and-security.md` Open Question 해소 — Server Action이 권한 검사 후 전용 DB 롤로 쓰기, RLS는 방어층으로만 사용
  - 이 결정으로 "RLS JWT 브리지 방식 확정" 항목은 폐기

### 인증

- [x] Auth.js v5 세션 연동: Authentik OIDC(조건부 활성) + 개발용 게스트 로그인
  - `src/features/auth/session.ts` — `AUTH_AUTHENTIK_*` env 3종 있을 때만 OIDC 활성, `AUTH_DEV_LOGIN=true`면 이름 기반 게스트 로그인(`dev:{name}` sub, 동일 이름=동일 계정)
  - `jwt` 콜백에서 `public.users` upsert 후 `token.uid`에 내부 id 저장. 미들웨어는 edge-safe 설정으로 쿠키만 검사, 실제 권한 검사는 각 Server Action
  - Authentik 실제 애플리케이션 등록은 미완료 — High 항목에서 추적

### 방 · 실시간 · 베팅 · 랭킹

- [x] 방 생성·입장·실시간 동기화 구현
  - `src/app/rooms/new/page.tsx`, `src/app/rooms/[code]/page.tsx`, `src/features/game/`(`actions.ts`, `queries.ts`, `room-code.ts`, `components/room-client.tsx` 외)
  - Broadcast는 공개 채널 `room:{uuid}` + anon key. 행동한 클라이언트가 Server Action 성공 후 이벤트를 직접 send, 수신자는 이벤트를 힌트로만 쓰고 `refreshRoom` 스냅샷 refetch(250ms 디바운스 + 20초 폴링 + `visibilitychange`)로 진실 상태 확정
  - 재접속 시에도 동일 `refreshRoom` 경로로 자동 복원됨 — 별도 `state.request`/`state.snapshot` 프로토콜은 마이그레이션에 정의만 있고 미사용

- [x] 베팅 액션 + 칩 원장 UI: `src/features/betting/actions.ts`, `src/features/game/components/action-bar.tsx`, `dealer-panel.tsx`

- [x] 정산·랭킹 화면: `src/app/rooms/[code]/result/page.tsx`, `src/app/ranking/page.tsx`, `src/features/ranking/queries.ts`

### 족보 Advisor

- [x] 수동 피커: `src/features/jokbo-advisor/components/card-picker.tsx`, `advisor-client.tsx`, `src/app/advisor/page.tsx`

- [x] 사진 인식(vision) 파이프라인: `src/features/jokbo-advisor/vision/actions.ts`
  - `@anthropic-ai/sdk` 사용, 모델은 env `JOKBO_VISION_MODEL`(기본 `claude-sonnet-5`)
  - 클라이언트에서 canvas로 1568px 리사이즈 → data URL → Server Action → JSON 응답 zod 검증 → (월, 종류)를 `CardId`로 정규화. 실패 시 수동 피커로 폴백
  - 판정 결과가 `hand_records`에 저장되지는 않음 — Medium 항목에서 추적

### CI/CD

- [x] 배포 파이프라인 구성: `.github/workflows/deploy.yml`(kanduit-lab `docker-deploy-control-hub` v2), `dockerfiles/Dockerfile.nextjs`, `next.config` `output: 'standalone'`
  - production 배포만 활성(`cd.deploy_env: production`). staging/preview는 `.deploy.yml`에 `enabled: false`로 대기 — High 항목에서 추적

- [x] Supabase keep-alive 크론: `.github/workflows/keep-alive.yml`
  - 6시간 간격으로 `keep_alive` 테이블에 REST insert, 7일 지난 행 삭제. 무료 티어 7일 비활성 pause 방지
  - 시크릿 `SUPABASE_URL` / `SUPABASE_ANON_KEY` GitHub repo에 등록 완료

### 스캐폴드

- [x] 저장소 초기화 및 표준 구조 생성: Next.js App Router 기준 디렉터리, 설정 파일, 라이선스
  - `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `vitest.config.ts`, `drizzle.config.ts`, `postcss.config.mjs`, `.env.example`
  - 의존성 설치 완료(`node_modules`, `pnpm-lock.yaml` 존재) — 최초 스캐폴드 시점의 버전 추정치 우려는 해소

- [x] 설계 문서 10종 작성: 개요·아키텍처·데이터 모델·실시간 프로토콜·게임 엔진·Advisor·기능 스펙·인증·UI/UX·로드맵
  - `docs/00-overview.md` ~ `docs/09-roadmap.md`

- [x] 도메인 타입·서열 상수 정의: 섯다 족보 서열, 고스톱 룰 프리셋, 실시간 이벤트 스키마
  - `src/features/seotda/types.ts`, `src/features/gostop/types.ts`, `src/lib/realtime/events.ts`

---

## Notes

- **섯다 엔진 구현·검증 순서 역전**: 원래 계획은 기대값 테이블 → TDD로 엔진을 짜는 순서였으나, 실제로는 `engine.ts`가 먼저 구현되고 테스트는 `it.todo` 상태로 남았다.
  기능은 동작하지만 190조합 전수 대조 전까지는 버그가 없다고 보증할 수 없다. High 항목에서 최우선 추적.
- **고스톱 엔진도 동일 패턴**: `scoring.ts` 구현은 끝났고 테스트 파일 자체가 없다.
- **`groups`/`group_members` 미사용**: 스키마엔 있으나 어떤 기능도 참조하지 않는다. 방치할지 활용할지 결정 필요 (Low 항목).
- **실시간 프로토콜 문서와 구현 차이**: `docs/03-realtime-protocol.md`가 서술하는 `state.request`/`state.snapshot` 명시적 왕복 대신, 실제로는 이벤트를 힌트로만 쓰고 매번 스냅샷을 refetch하는 방식으로 구현됐다. 문서 갱신은 해당 문서 담당 에이전트 소관.
- **빌드 실행**: `pnpm build` 등 무거운 빌드는 사용자가 실행한다. 단위 테스트·lint·typecheck는 에이전트가 직접 돌려도 된다. 자세한 분업은 `CLAUDE.md`.
- **설계 결정 기록**: `docs/design-decisions/`는 git 미추적이다 (`.gitignore`).
