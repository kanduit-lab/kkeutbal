# 끗발 (Kkeutbal)

> 실물 화투판(섯다·고스톱)의 **승패 기록**과 **족보 판독**을 맡는 앱. 손맛은 그대로.

MT나 모임에서 친구들끼리 **돈 안 걸고** 섯다·고스톱을 하면, 칩을 공용으로 쓰다 보니
누가 얼마 땄는지, 오늘 판의 승자가 누군지 기록이 안 남는다. **끗발**은 그 문제를 푼다.

**칩은 실물 그대로 쓴다.** 앱은 판을 대체하지 않고 옆에서 기록만 한다.
그래서 첫 번째 제약은 기능이 아니라 **게임 진행을 방해하지 않는 것**이다.

- 판이 끝나면 승패를 남기고, 세션·누적 랭킹이 자동으로 쌓인다.
- 족보가 헷갈리면 카드를 고르거나 사진 한 장으로 즉시 확인한다.
- 원격 베팅은 **실물 칩이 모자라거나 디지털로 처리해야 할 때 꺼내 쓰는 보조 수단**이다.

---

## 핵심 기능

| 기능 | 설명 |
|------|------|
| 🏆 **승패 랭킹** *(메인)* | 판별 승자 기록, 세션·누적 순손익, 승률, MVP·호구 등 재미 지표 |
| 🔮 **족보 Advisor** *(메인)* | 섯다·고스톱 끗/점수 판독 — 수동 카드 피커 + 카메라 사진 인식(Claude vision) |
| 🎴 **실시간 판(Room)** | 방 코드/QR로 입장, 결과·액션이 전원 화면에 즉시 반영. 방은 동시에 여러 개 운영 가능 |
| 💰 **개인 예산 관리** | 참가자별 바이인/예산 설정, 잔액·손익 추적, 한도 경고 |
| 🕹️ **원격 베팅** *(보조)* | 실물 칩 부족·디지털 정산이 필요할 때. 딜러 승인 or 신뢰 모드 |

지원 게임: **섯다**, **고스톱** (둘 다 화투 48장 기반). 엔진은 플러그인 구조라 이후 확장 가능.

---

## 기술 스택

- **Frontend / Backend**: Next.js 15 (App Router, TypeScript, RSC + Server Actions)
- **실시간**: Supabase Realtime — **Broadcast**(라이브 액션, 저지연) + **Presence**(접속자)
- **DB**: PostgreSQL (Supabase 관리형) + Drizzle ORM, RLS로 방 격리
- **인증**: Auth.js v5 + **Authentik OIDC** (SSO / 전체 로그인)
- **족보 vision**: Anthropic Claude (`claude-sonnet-5`)
- **배포**: Vercel (앱) + Supabase (DB·Realtime) — 전용 서버 불필요

> 왜 Supabase Realtime이 안 느린가: "느리다" 평판은 대개 *Postgres Changes*(CDC 복제) 얘기다.
> 끗발은 라이브 액션에 **Broadcast 채널**(DB 안 거치는 순수 WebSocket, 수십 ms)을 쓰고,
> 영속·재접속 동기화만 Postgres로 처리한다. 8인 판에 충분. 상세: [`docs/03-realtime-protocol.md`](docs/03-realtime-protocol.md)

---

## 빠른 시작

> ⚠️ 빌드/설치 실행은 사용자 몫. 아래는 실행할 명령.

```bash
# 1) 의존성
pnpm install            # 또는 npm install

# 2) 환경변수
cp .env.example .env.local
#   Supabase URL/키, Authentik OIDC, ANTHROPIC_API_KEY 채우기

# 3) DB 스키마 + RLS
pnpm db:push            # drizzle 스키마 반영
#   또는 supabase/migrations/*.sql 적용

# 4) 개발 서버
pnpm dev                # http://localhost:3000
```

환경변수 상세: [`.env.example`](.env.example) · [`docs/07-auth-and-security.md`](docs/07-auth-and-security.md)

---

## 프로젝트 구조

```
src/
├── app/                # Next.js App Router (라우트·레이아웃·서버 액션)
├── features/           # 도메인 모듈 (high cohesion, low coupling)
│   ├── hwatu/          # 화투 48장 카드 모델 (공통)
│   ├── seotda/         # 섯다 끗/족보 엔진
│   ├── gostop/         # 고스톱 점수 엔진
│   ├── game/           # 방/세션/라운드 상태머신
│   ├── betting/        # 원격 베팅 액션·승인
│   ├── ranking/        # 승패·랭킹 집계
│   ├── budget/         # 개인 예산·바이인
│   ├── jokbo-advisor/  # 수동 피커 + vision 인식
│   └── auth/           # Authentik OIDC · 역할
├── lib/                # supabase·auth·env 등 공용 인프라
└── components/         # 공용 UI

docs/                   # 설계 문서 (아래 인덱스)
drizzle/                # 스키마·마이그레이션 (typed)
supabase/migrations/    # SQL 마이그레이션 (RLS·realtime)
```

---

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
| [`docs/07-auth-and-security.md`](docs/07-auth-and-security.md) | Authentik OIDC·역할·보안 |
| [`docs/08-ui-ux.md`](docs/08-ui-ux.md) | 화면·모바일 우선·입력 UX |
| [`docs/09-roadmap.md`](docs/09-roadmap.md) | 단계별 마일스톤 |

실행 진행 상황: [`TODO.md`](TODO.md) · 에이전트 가이드: [`CLAUDE.md`](CLAUDE.md)

---

## 라이선스

[MIT](LICENSE) © 2026 kanduit-lab
