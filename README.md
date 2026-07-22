# 끗발 (Kkeutbal)

| Field | Value |
|-------|-------|
| Type | README |
| Audience | maintainers |
| Status | active |
| Source of truth | 코드(`src/`, `package.json`, `.env.example`) — 각 항목은 `docs/`로 링크 |
| Last reviewed | 2026-07-22 |

판돈 없이 즐기는 화투(섯다·고스톱) 실시간 판 기록·베팅·랭킹·족보 트래커.
칩은 실물 그대로 쓰고, 앱은 판 옆에서 승패·손익 기록과 족보 판독만 맡는다.

## 기능

| 기능 | 상태 | 설명 |
|------|------|------|
| 방(room) 입장·생성 | 구현 | 방 코드로 입장, 참가자별 진행 중인 방 목록 (`src/app/page.tsx`) |
| 실시간 판 동기화 | 구현 | Broadcast 공개 채널 + 스냅샷 refetch, 상세는 `docs/03-realtime-protocol.md` |
| 칩 원장(chip ledger) | 구현 | append-only 원장, 잔액은 `sum(delta)`, 정정은 역부호 행, 방 단위 advisory lock으로 직렬화 |
| 베팅 | 구현 | 클라이언트 UUID를 멱등키로 사용하는 Server Action |
| 승패 랭킹 | 구현 | 세션·누적 순손익 집계 |
| 예산/바이인 | 구현 | 참가자별 예산 관리 |
| 족보 Advisor — 수동 피커 | 구현 | 섯다/고스톱/포커 탭 3개. 카드 수동 선택으로 끗/점수/족보 판독 + 서열 순위·동급 수·승률(섯다)·등장 확률(포커) 통계 (`src/features/jokbo-advisor/stats.ts`) |
| 족보 Advisor — 사진 인식 | 구현 | Claude vision으로 카드 인식(섯다·고스톱만, 포커 탭엔 노출 안 됨) → 실패 시 수동 피커 폴백. 판독 결과는 저장하지 않음 |
| 게임 가이드 | 구현 | 섯다·고스톱·포커 족보 서열표 + 앱 사용법 정적 페이지 (`/guide`, 로그인 필요) |
| 인증 | 구현 | Auth.js v5, 개발 게스트 로그인(이름만) + Authentik OIDC(선택) |
| groups/group_members | 스키마만 | 테이블은 존재하나 기능 미구현 |
| E2E 자동화 | 미구현 | `test:e2e` 스크립트는 있으나 스위트 없음 |

지원 게임: 섯다·고스톱(화투 48장 공통 모델), 포커(트럼프 52장, 텍사스 홀덤 족보 — `src/features/poker/`). 방·베팅·랭킹 흐름은 게임 종류와 무관하게 공통이다.

## 스택

| 레이어 | 선택 |
|--------|------|
| 앱 | Next.js 15 App Router, TypeScript strict, RSC + Server Actions |
| 실시간 | Supabase Realtime Broadcast(공개 채널, anon key) — Postgres Changes 아님 |
| DB | PostgreSQL(Supabase) + Drizzle ORM + postgres-js, 전용 롤 `kkeutbal_app`(bypassrls) |
| 인증 | Auth.js v5 — 개발 게스트 로그인 또는 Authentik OIDC |
| Vision | `@anthropic-ai/sdk`, 모델은 `JOKBO_VISION_MODEL`(기본 `claude-sonnet-5`) |
| 배포 | kanduit-lab 공용 docker-deploy-control-hub(v2), Docker 이미지, 전용 서버 없음 |

DB 쓰기는 전부 Server Action이 권한 검사 후 수행한다. Supabase RLS는 anon/authenticated에 대한 방어층일 뿐 앱 쓰기 경로가 의존하는 1차 권한 체계가 아니다. 상세는 `docs/01-architecture.md`, `docs/02-data-model.md`, `docs/03-realtime-protocol.md`.

## 빠른 시작

> 빌드/설치 실행은 사용자 몫. 아래는 실행할 명령만 제시한다.

```bash
# 1) 의존성
pnpm install

# 2) 환경변수
cp .env.example .env.local
# 아래 "환경변수" 표 참고해 값 채우기

# 3) DB 스키마
pnpm db:push          # drizzle 스키마 반영 (개발용)
# 프로덕션은 drizzle 마이그레이션 + supabase/migrations/*.sql(RLS) 별도 적용

# 4) 개발 서버
pnpm dev               # http://localhost:3000
```

### 환경변수

`src/lib/env.ts`가 검증 단일 지점이다. `.env.example`과 다르면 이 목록이 맞다.

| 변수 | 필수 | 비고 |
|------|------|------|
| `NEXT_PUBLIC_APP_URL` | 필수 | |
| `NEXT_PUBLIC_SUPABASE_URL` | 필수 | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 필수 | Realtime 공개 채널 구독에 사용 |
| `DATABASE_URL` | 필수 | `kkeutbal_app` 롤, Supabase pooler(session mode, 5432) 연결 문자열 |
| `AUTH_SECRET` | 필수 | `openssl rand -base64 32` |
| `AUTH_DEV_LOGIN` | 선택(기본 `false`) | `true`면 이름만으로 게스트 로그인 허용. 프로덕션에 배포 금지 |
| `AUTH_AUTHENTIK_ID` / `AUTH_AUTHENTIK_SECRET` / `AUTH_AUTHENTIK_ISSUER` | 선택 | 3종 모두 설정된 경우에만 Authentik OIDC 활성화 |
| `ANTHROPIC_API_KEY` | 선택 | 없으면 vision 인식 비활성, 수동 피커는 항상 동작 |
| `JOKBO_VISION_MODEL` | 선택(기본 `claude-sonnet-5`) | |
| `JOKBO_VISION_ENABLED` | 선택(기본 `false`) | |

`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`은 쓰지 않는다 — DB 접근은 `DATABASE_URL`의 전용 롤로, Realtime 구독은 anon key로 충분하다.

## 프로젝트 구조

```
src/
├── app/                # 라우트·레이아웃·Server Action (guide/ 게임 가이드 정적 페이지 포함)
├── features/           # 도메인 모듈
│   ├── hwatu/          # 화투 48장 카드 모델
│   ├── seotda/         # 섯다 끗/족보 엔진
│   ├── gostop/         # 고스톱 점수 엔진
│   ├── poker/          # 포커 카드 모델(52장)·족보 엔진
│   ├── game/           # 방/세션/라운드 상태머신
│   ├── betting/        # 베팅 액션·승인
│   ├── ranking/        # 승패·랭킹 집계
│   ├── budget/         # 개인 예산·바이인
│   ├── jokbo-advisor/  # 수동 피커 + vision 인식 + 통계
│   └── auth/           # 역할·권한
├── lib/                # env·supabase·auth·realtime 등 공용 인프라
└── components/         # 공용 UI (hwatu-card.tsx 카드 비주얼 등)

drizzle/                # 스키마 (typed source of truth)
supabase/migrations/    # RLS·realtime SQL
dockerfiles/            # Dockerfile.nextjs
docs/                   # 설계 문서
```

## 명령어

```bash
pnpm dev            # 개발 서버
pnpm typecheck      # tsc --noEmit
pnpm lint           # eslint
pnpm test           # vitest (단위)
pnpm test:e2e       # playwright (스위트 미작성)
pnpm db:generate    # drizzle 마이그레이션 생성
pnpm db:push        # 스키마 반영
```

빌드(`pnpm build`)는 사용자가 실행한다. 에이전트는 코드 수정·오류 분석만 담당.

## 배포

kanduit-lab 공용 docker-deploy-control-hub(v2) 워크플로(`.github/workflows/deploy.yml`)로 프로덕션 배포. 배포 설정은 `.deploy.yml`(`app_name: kkeutbal`, 도메인 `kkeutbal.kanduit.app`, health check `/api/health`). staging·preview 채널은 `.deploy.yml`에 `enabled: false`로 정의만 되어 있고 `ENV_FILE_BASE64` 시크릿 구성 전까지 비활성이다. `.github/workflows/keep-alive.yml`이 6시간 간격으로 Supabase `keep_alive` 테이블에 REST ping을 보내 무료 티어 슬립을 방지한다.

## 문서

| 문서 | 내용 |
|------|------|
| [`docs/00-overview.md`](docs/00-overview.md) | 제품 비전·범위·기능·용어집 |
| [`docs/01-architecture.md`](docs/01-architecture.md) | 스택·배포 토폴로지·모듈 경계 |
| [`docs/02-data-model.md`](docs/02-data-model.md) | Postgres 스키마·ERD·RLS |
| [`docs/03-realtime-protocol.md`](docs/03-realtime-protocol.md) | 채널·이벤트 스키마·상태 동기화 |
| [`docs/04-game-engines.md`](docs/04-game-engines.md) | 화투 카드 모델·섯다 끗·고스톱 점수 |
| [`docs/05-jokbo-advisor.md`](docs/05-jokbo-advisor.md) | 수동 피커 + Claude vision 인식 |
| [`docs/06-features-ranking-budget-betting.md`](docs/06-features-ranking-budget-betting.md) | 랭킹·예산·베팅·역할 스펙 |
| [`docs/07-auth-and-security.md`](docs/07-auth-and-security.md) | 인증·역할·보안 |
| [`docs/08-ui-ux.md`](docs/08-ui-ux.md) | 화면·모바일 우선·입력 UX |
| [`docs/09-roadmap.md`](docs/09-roadmap.md) | 단계별 마일스톤 |

실행 진행 상황: [`TODO.md`](TODO.md) · 에이전트 가이드: [`CLAUDE.md`](CLAUDE.md)

## 라이선스

[MIT](LICENSE) © 2026 kanduit-lab
