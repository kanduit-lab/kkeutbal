# TODO

단계 구분과 우선순위 원칙(수동 대체 경로 없는 것부터)은 [`docs/09-roadmap.md`](docs/09-roadmap.md)가 소유한다.
이 파일은 **실행 가능한 잔여 작업**만 추적한다.

## Priority

### High — P0 라이브 경로 증명 (대체 경로 없음)

- [ ] **실배포 2기기 스모크 1회**: 배포된 앱에서 전체 플로우 엔드투엔드 완주
  - 변경 범위: 없음 (검증 활동). 깨지는 곳 발견 시 수정 작업 파생
  - 완료 기준: 실기기 2대로 로그인 → 방 생성 → 입장 → 베팅 → 동기화 → 판 종료 → 정산 → 랭킹 완주.
    같은 세션에서 Broadcast 왕복 p95 300ms 이내 실측 기록(구 "실시간 지연 조기 측정" 흡수)
  - 참조: `docs/09-roadmap.md` P0-2, `docs/03-realtime-protocol.md` "지연 목표와 측정". "구현 완료"가 배포 상태로 돈 적이 아직 없다 — 정보량 최대 검증

- [ ] **실물 리허설**: 실제 화투로 3판 이상 진행하며 앱과 대조
  - 변경 범위: 없음 (검증 활동)
  - 완료 기준: 개발자 콘솔·DB 직접 수정 없이 완주. 한 손 조작·어두운 조명 조건도 함께 확인(구 "실기기 리허설" 흡수)
  - 참조: `docs/09-roadmap.md` P0-3. 섯다 픽스처 검증(아래) 완료 후 진행해야 판정 대조에 의미가 있음

### Medium — P1 정확도 검증 · P2 자동화

- [ ] **섯다 엔진 검증**: `evaluateSeotdaHand` · `resolveSeotdaShowdown`은 구현됐지만 테스트가 비어 있다
  - 변경 범위: `src/features/seotda/engine.test.ts`, 신규 `src/features/seotda/seotda.fixtures.ts`
  - 완료 기준: 190조합(20장 중 2장) 전수 기대값 테이블을 사람이 직접 작성(엔진 출력으로 생성 금지) 후, `engine.test.ts`의 `it.todo` 19건을 실제 테스트로 전환해 전부 통과, 커버리지 90%+
  - 참조: `src/features/seotda/engine.ts`(구현 완료), `docs/04-game-engines.md` 서열표. 실물 리허설(P0-3) 전 완료가 이상적

- [ ] **고스톱 엔진 테스트**: `captureOf` · `scoreGostop` · `hasChongtong`은 구현됐지만 테스트가 없다
  - 변경 범위: 신규 `src/features/gostop/scoring.test.ts`
  - 완료 기준: 경계값(4/5/9/10장)·배수 조합 테스트 통과, `breakdown` 근거 표시 검증
  - 참조: `src/features/gostop/scoring.ts`(278줄, 구현 완료)

- [ ] **E2E 테스트 스위트**: Playwright 자동화가 아직 없다
  - 변경 범위: `e2e/` (신규)
  - 완료 기준: 2컨텍스트 동기화, 재접속 복원, 정산 흐름에 대해 `pnpm test:e2e` 통과 — P0 스모크에서 수동으로 밟은 경로의 스크립트화
  - 참조: `package.json`의 `test:e2e` 스크립트는 정의돼 있으나 대상 디렉터리 없음

- [ ] **staging 배포 시크릿 구성**: `ENV_FILE_BASE64` 등록 후 `.deploy.yml` staging/preview 활성화
  - 변경 범위: GitHub repo secrets, `.deploy.yml`
  - 완료 기준: `staging.enabled` / `preview.enabled`를 `true`로 전환해도 `develop` 브랜치 배포와 PR 프리뷰가 정상 기동
  - 참조: `.deploy.yml` (현재 둘 다 `enabled: false`로 주석에 사유 명시), `.github/workflows/deploy.yml`. MT를 게이팅하지 않는 개발 편의 항목

### Low — 2026-07-23 개선 스윕 후속

- [ ] **admin·vision 액션 에러 키 전환**: `auth/admin-actions.ts` · `jokbo-advisor/vision/actions.ts`가
  아직 한국어 원문을 반환한다 — 관리자·어드바이저 화면이 ko 중심이라 허용 범위로 남김
  (주 플로우 액션은 전부 `errors.*` 키 전환 완료, 정책은 `src/lib/i18n/client.tsx` JSDoc)
- [ ] **betActions.reason 시스템 사유 코드화**: `'잔액 부족 (자동 거절)'`처럼 서버가 심는 reason이
  딜러 자유 입력과 같은 컬럼에 섞여 번역 불가 — 시스템 사유만 고정 코드로 분리하면 해결
- [ ] **전광판 박 표시**: `RecentRoundView.penalties`가 이미 내려오지만 `monitor-client.tsx`는
  미표시 — 결과 페이지와 같은 "박×N" 마커 추가만 하면 됨
- [ ] **result 페이지 i18n**: `rooms/[code]/result/page.tsx` 전체가 하드코딩 한국어 —
  박 마커 포함 사전 배선 필요 (제안 키: `result.penaltyMarker` 템플릿)

---

## Completed

### 병렬 개선 스윕 — 감사 10 + 구현 23 에이전트 (2026-07-23)

- [x] **실시간·재접속 강화**: `use-room-sync` 재작성 — stale 채널 레이스 차단, CLOSED 백오프
  자동 재구독, 응답 순서 가드, refetch 실패 표면화(`syncFailed`·`authError`), `pageshow`/`online`/
  `offline` 리스너, 이벤트 유래 refetch 1초 상한, 무변경 스냅샷 참조 유지. `RoomEvent` 판별 유니온
- [x] **이중 베팅 봉쇄**: 베팅 의도당 `actionId` 1회 생성·재사용(액션바·대리 입력), 타임아웃 시
  refetch 로 반영 여부 판정. `runAction` try/catch + 실패 시 재동기화
- [x] **딜러 실수 복구**: 지난 판(ended) 취소(`voidRound` 확장), 바이인 지급 취소(`undoLastBuyIn`),
  판 무효·되돌리기 ConfirmDialog + 사유 칩
- [x] **멤버 관리**: 강퇴(`removeMember`)·나가기(`leaveRoom`)·재입장(leftAt 해제), 판중 입장자
  베팅 가드, 강퇴 감지 시 홈 이동
- [x] **정산**: who-pays-whom 최소 이체(`computeSettlementTransfers`, 테스트 11), 결과 텍스트
  공유 버튼, 홈 지난 세션 목록, 방 헤더 🧾 결과 링크
- [x] **고스톱 정산 정확화**: `endRound` `loserPenalties`(피박·광박 패자별 ×2/×4) + 공통 배수
  (흔들기·총통) UI (`gostop-score-form.tsx`)
- [x] **테이블 UX**: 턴·대기 힌트, 승인 대기 뱃지, 최소 레이즈 프리셋 필터, 다이/올인 후 잠금,
  `formatChips` 만 단위 축약, 7인+ 밀집 좌석, 음소거 토글
- [x] **전광판**: Screen Wake Lock + 전체 화면, board 스케일 타이포, 최근 판 피드·현재 1위,
  관전자(비멤버) 열람 허용 + presence 미등록
- [x] **방 옵션 확장**: 대기 중 시작 칩 수정(차액 보정), 최대 인원(2~10), 관전자 입장 토글,
  설정 변경 즉시 브로드캐스트(`room.settings_changed`)
- [x] **상태·접근성**: error/global-error/not-found/loading×5, 모달 계약(Escape·포커스 트랩·
  스크롤 잠금), 터치 disabledReason 토스트, 토스트 aria-live, `viewportFit: cover`,
  SubmitButton(useFormStatus), 가입 폼 입력 보존, 에러 코드 화이트리스트
- [x] **i18n 전면**: 사전 ko/en 360+키, `useDict()`/`format()` 클라이언트 패턴, 방 UI·auth·about
  전환 (게임 용어는 원어 유지, guide 는 콘텐츠 경계로 ko 고정)
- [x] **신기능**: 로비·전광판 QR 입장, 게스트 이름 피커(오타 계정 분기 방지), 개인 전적 페이지
  (`/ranking/player/[id]`), 랭킹 게임·기간 필터, 관리자 방 강제 정산
- [x] **성능**: `getRoomSnapshot` 2단계 병렬화(~8RTT→~2RTT), `chip_ledger(round_id, reason)`
  인덱스(live 적용), 스프라이트 816KB→471KB(알파 제거), ActionBar 단일 인스턴스

### 개선 스윕 Low 후속 처리 (2026-07-23)

- [x] **서버 액션 에러 errors.* 키 전환**: 주 플로우 액션 전부(game/actions·round-actions·
  member-actions·betting·budget) `errors.*` 키 반환으로 전환, 사전에 82키 등록.
  `joinRoomAndGo` 홈 `?error=` 배너도 키 → `localizeError` 매핑 (`src/app/page.tsx`)
- [x] **formatChips 로케일 인지**: `formatChips(n, locale='ko')` — ko '만' 유지, en k/M 축약.
  호출부 13곳 `useDict()` locale 배선, `shared.test.ts` 8케이스 신규
- [x] **고스톱 loserPenalties 영속화**: `rounds.result` jsonb에 `penalties: {userId, factor}[]`
  (factor>1 실패자만) 저장 — 스키마 변경 없음. 결과 페이지 판 기록에 "박×2/박×4" 마커,
  구 데이터는 필드 부재 시 안전 통과

### 계정 · 운영 · UX 개편 (2026-07-23)

- [x] 내부 사용자 시스템: 아이디·비밀번호(bcrypt)·이름·전화번호 회원가입/로그인,
  SSO(Authentik) 로그인 시 아이디 또는 전화번호 일치 계정으로 자동 연동
  - `drizzle/schema.ts`(users 확장), `src/lib/auth.ts`, `src/features/auth/actions.ts`, `/register`
- [x] 관리자 시스템: 게스트 토큰 발급·회수(`guest_tokens`), 관리자 지정, `/admin` 콘솔,
  `AUTH_ADMIN_USERNAMES` 부트스트랩. 게스트 토큰 + 이름으로 로그인하는 `guest-token` provider
- [x] 코어 UX 개편: 테이블·좌석 대형화(아바타·칩 스택·액션 뱃지), 좌석 탭 멤버 시트
  (바이인·대리 입력·역할·방장 위임), 키보드 없는 Stepper 입력, 입장 대기방 로비,
  모니터링 전광판(`/rooms/{code}/monitor`), 방 옵션 페이지(`/rooms/{code}/settings`),
  연결 끊김 시 다시 연결 버튼
- [x] 방 옵션: `updateRoomSettings`(이름·입력 모드·점당 칩·삥 단위), rulePreset `baseBet`
- [x] `/about` 소개 페이지, README 개편, docs 프루닝(00·05·06·08 삭제 — 코드·README와 중복)
- [x] CI 워크플로우(`ci.yml` — typecheck·lint·test), Dockerfile pnpm 버전 고정 + 스토어 캐시
- [x] 화투 카드 이미지 에셋: `public/cards/hwatu-sheet.webp` 48장 스프라이트 + CC BY-SA 4.0 출처 기록

### 스키마 정리

- [x] 미사용 스키마 제거: `groups` / `group_members` / `hand_records` 테이블, `hand_source` enum, `rooms.group_id` 컬럼 삭제 (2026-07-23)
  - `drizzle/schema.ts` 수정, 마이그레이션 `drizzle/migrations/0001_silent_moondragon.sql` 생성
  - 코드 참조 0건 확인(`src/` 전체 grep — 로컬 변수 `groups`만 존재). RLS 정책은 테이블 CASCADE로 소멸
  - 이 결정으로 누적 랭킹은 전역 사용자 단위로 확정, Advisor 판독 결과는 저장하지 않는 것이 확정 동작
  - 근거 기록: `docs/design-decisions/` 001. **DB 반영은 사용자 실행 대기** — Notes 참조

### 도메인 엔진

- [x] 화투 48장 카드 모델: 월별 명세에서 덱 파생, 섯다 20장 부분집합 도출
  - `src/features/hwatu/cards.ts`, `types.ts`, 검증: `cards.test.ts`

- [x] 섯다 판정 엔진 구현: `evaluateSeotdaHand` · `resolveSeotdaShowdown` · `describeSeotdaHand`
  - `src/features/seotda/engine.ts` — 암행어사·땡잡이·구사 룰 토글, 동급 처리(`replay` / `dealer-wins`) 포함
  - 테스트는 아직 `it.todo` 상태 — Medium "섯다 엔진 검증" 항목에서 별도 추적

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
  - Authentik 실제 애플리케이션 등록은 미완료 — High "MT 인증 결정·구성" 항목에서 추적

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
  - 판독 결과는 저장하지 않는다 — 2026-07-23 확정 동작(`hand_records` 스키마 제거)

### CI/CD

- [x] 배포 파이프라인 구성: `.github/workflows/deploy.yml`(kanduit-lab `docker-deploy-control-hub` v2), `dockerfiles/Dockerfile.nextjs`, `next.config` `output: 'standalone'`
  - production 배포만 활성(`cd.deploy_env: production`). staging/preview는 `.deploy.yml`에 `enabled: false`로 대기 — Medium 항목에서 추적

- [x] Supabase keep-alive 크론: `.github/workflows/keep-alive.yml`
  - 6시간 간격으로 `keep_alive` 테이블에 REST insert, 7일 지난 행 삭제. 무료 티어 7일 비활성 pause 방지
  - 시크릿 `SUPABASE_URL` / `SUPABASE_ANON_KEY` GitHub repo에 등록 완료

### 스캐폴드

- [x] 저장소 초기화 및 표준 구조 생성: Next.js App Router 기준 디렉터리, 설정 파일, 라이선스
  - `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `vitest.config.ts`, `drizzle.config.ts`, `postcss.config.mjs`, `.env.example`
  - 의존성 설치 완료(`node_modules`, `pnpm-lock.yaml` 존재) — 최초 스캐폴드 시점의 버전 추정치 우려는 해소

- [x] 설계 문서: 아키텍처·데이터 모델·실시간 프로토콜·게임 엔진·인증·로드맵 6종
  - 2026-07-23 프루닝 — 00-overview·05-advisor·06-features·08-ui-ux 는 코드·README와 중복이라 삭제
  - 2026-07-23 로드맵 우선순위 재정렬(라이브 경로 우선) 및 스키마 제거 반영으로 전면 갱신

- [x] 도메인 타입·서열 상수 정의: 섯다 족보 서열, 고스톱 룰 프리셋, 실시간 이벤트 스키마
  - `src/features/seotda/types.ts`, `src/features/gostop/types.ts`, `src/lib/realtime/events.ts`

---

## Notes

- **DB 반영 완료 (2026-07-23)**: 스키마 제거(0001)·users 확장·`guest_tokens`(0002)·
  `chip_ledger_round_reason_idx`(0003) 전부 live DB 적용됨 — `kkeutbal_app` 롤엔 DDL 권한이 없어
  Supabase Management API(`/database/query`) 경유로 적용했다. `pnpm db:push`는 비대화형에서
  rename 프롬프트로 행 걸리니 쓰지 말 것.
- **우선순위 재정렬 (2026-07-23)**: 엔진 검증(P0)→라이브 경로(P1)이던 순서를 뒤집었다. 근거는
  `docs/09-roadmap.md` 전제 — 수동 대체 경로 없는 것부터. 섯다/고스톱 정확도는 사람이 육안 교정 가능,
  라이브 경로는 대체 불가.
- **섯다·고스톱 엔진 구현·검증 순서 역전**: `engine.ts`/`scoring.ts`가 먼저 구현되고 테스트가 뒤처졌다.
  190조합 전수 대조 전까지 버그 없음을 보증할 수 없다 — Medium 최상단에서 추적.
- **실시간 프로토콜 문서 갱신 완료 (2026-07-23)**: `docs/03-realtime-protocol.md`가 이벤트 12종·
  재접속 백오프 정책·실패 표면화 표를 포함해 실제 구현과 일치한다.
- **빌드 실행**: `pnpm build` 등 무거운 빌드는 사용자가 실행한다. 단위 테스트·lint·typecheck는 에이전트가 직접 돌려도 된다. 자세한 분업은 `CLAUDE.md`.
- **설계 결정 기록**: `docs/design-decisions/`는 git 미추적이다 (`.gitignore`).
