<div align="center">

# 🎴 끗발 <sub>Kkeutbal</sub>

**판돈 없이 즐기는 섯다 · 고스톱 · 포커 실시간 판 기록**

방 코드 하나로 모이고, 각자 폰으로 베팅하고, 끝나면 손익과 랭킹이 자동으로 남습니다.

[![CI](https://github.com/kanduit-lab/kkeutbal/actions/workflows/ci.yml/badge.svg)](https://github.com/kanduit-lab/kkeutbal/actions/workflows/ci.yml)
[![Deploy](https://github.com/kanduit-lab/kkeutbal/actions/workflows/deploy.yml/badge.svg)](https://github.com/kanduit-lab/kkeutbal/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
![Next.js 16](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![TypeScript strict](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)

</div>

---

| Field | Value |
|-------|-------|
| Type | README |
| Audience | maintainers |
| Status | active |
| Source of truth | 코드(`src/`, `drizzle/`, `.env.example`) — 설계 근거는 `docs/`로 링크 |
| Last reviewed | 2026-07-24 |

MT·모임에서 공용 칩으로 화투나 포커를 치면 승패 기록이 남지 않습니다. 끗발은 실물 게임을
방해하지 않으면서 — 카드와 칩은 그대로 쓰고 — 베팅·승패·정산만 각자 폰으로 기록하는
실시간 판 기록 도구입니다.

## ✨ 기능

| | 기능 | 설명 |
|---|------|------|
| 🪑 | **실시간 테이블** | 좌석·칩 스택·팟이 보이는 펠트 테이블. 베팅 모션·사운드, 전원 화면 동기화 |
| 🎯 | **표준 베팅** | 플레이어별 누적 납입액 기준 콜·레이즈, 프리셋(삥·따당·하프·풀), 키보드 없이 터치만으로 |
| 🌸 | **고스톱 점수 정산** | 고·흔들기·폭탄 누적 규칙을 반영한 점수 × 점당 칩을 패자 전원이 자동 지불 |
| 🧾 | **칩 원장** | append-only 원장, 잔액 = `sum(delta)`, 정정은 역부호 행, advisory lock 직렬화 |
| 🕹️ | **운영 도구** | 입장 대기방, 좌석 탭으로 바이인·대리 입력·역할·방장 위임, 방 옵션 페이지, 딜러 승인 모드 |
| 📺 | **모니터링 화면** | 판 옆 태블릿·TV용 읽기 전용 전광판 (`/rooms/{code}/monitor`) |
| 🏆 | **누적 랭킹** | 세션 손익·MVP 배지, 정산된 모든 세션 합산 전역 랭킹 |
| 🔮 | **족보 판독** | 수동 피커 + Claude vision 사진 인식, 서열·승률·확률 통계 |
| 🔐 | **계정** | 아이디·비밀번호 내부 계정, SSO(Authentik) 자동 연동, 관리자 발급 게스트 토큰 |
| 📣 | **공지** | 관리자가 배너·팝업을 예약·우선순위·다시 보지 않기 시간과 함께 운영 |

지원 게임: 섯다·고스톱(화투 48장 공통 모델), 포커(트럼프 52장, 텍사스 홀덤 족보).
방·베팅·랭킹 흐름은 게임 종류와 무관하게 공통입니다.

## 🧱 스택

| 레이어 | 선택 |
|--------|------|
| 앱 | Next.js 16 App Router · TypeScript strict · RSC + Server Actions · `output: 'standalone'` |
| 실시간 | Supabase Realtime **Broadcast** 공개 채널 + 스냅샷 refetch — [`docs/03-realtime-protocol.md`](docs/03-realtime-protocol.md) |
| DB | PostgreSQL(Supabase) · Drizzle ORM · 전용 롤 `kkeutbal_app` — [`docs/02-data-model.md`](docs/02-data-model.md) |
| 인증 | Auth.js v5 — 내부 계정(bcrypt) · Authentik OIDC 자동 연동 · 게스트 토큰 — [`docs/07-auth-and-security.md`](docs/07-auth-and-security.md) |
| Vision | `@anthropic-ai/sdk` (`JOKBO_VISION_MODEL`, 기본 `claude-sonnet-5`) |
| 배포 | Docker + kanduit-lab docker-deploy-control-hub v2 |

모든 DB 쓰기는 Server Action이 권한 검사 후 수행합니다. RLS는 방어층입니다.

## 🚀 빠른 시작

```bash
pnpm install
cp .env.example .env.local   # 아래 환경변수 표 참고
pnpm db:migrate              # 생성된 drizzle 마이그레이션 순차 적용
pnpm dev                     # http://localhost:3000
```

### 환경변수

`src/lib/env.ts`가 검증 단일 지점입니다.

| 변수 | 필수 | 비고 |
|------|:---:|------|
| `NEXT_PUBLIC_APP_URL` | ✅ | |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ✅ | Realtime 공개 채널 구독 |
| `DATABASE_URL` | ✅ | `kkeutbal_app` 롤. 5432(session) 또는 6543(transaction) pooler — 포트별 연결 옵션은 자동 적용 |
| `DATABASE_CA_CERT_BASE64` | ✅ | Supabase 대시보드의 CA 인증서를 base64로 인코딩한 값 |
| `AUTH_SECRET` | ✅ | `openssl rand -base64 32` |
| `AUTH_TRUST_HOST` | ✅ | 프록시 환경의 Auth.js 호스트 검증 |
| `KEEP_ALIVE_SECRET` | ✅ | GitHub Actions의 같은 이름 secret과 일치하는 32자 이상 값 |
| `ANTHROPIC_API_KEY` / `JOKBO_VISION_ENABLED` | — | 둘 다 설정하면 사진 인식 사용 |
| `JOKBO_VISION_MODEL` | — | 사진 인식 모델 변경용 선택값. 기본값은 `src/lib/env.ts` 참고 |

Supabase 대시보드의 **Database Settings → SSL Configuration**에서 CA 인증서를 내려받아 base64로
인코딩한 값을 `DATABASE_CA_CERT_BASE64`에 넣습니다. 배포 환경에는 `KEEP_ALIVE_SECRET`도 설정하고,
GitHub Actions secret `KEEP_ALIVE_SECRET`에는 같은 값을 등록합니다.

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes('C:\path\to\prod-supabase.cer'))
```

처음 실행할 때 로그인 화면에서 **초기 관리자 만들기**를 선택해 아이디·비밀번호를 만듭니다.
첫 계정만 관리자이며, 이후 내부 계정 가입은 `/admin`에서 관리자가 발급한 가입코드가 필요합니다.
Authentik SSO도 `/admin`의 SSO 설정에서 연결합니다.

## 🗂️ 구조

```
src/
├── app/                # 라우트 — rooms/[code] (방·monitor·settings·result), advisor,
│   │                   #   ranking, guide, admin, about, login, register
├── features/           # 도메인 모듈 (경계 = 폴더)
│   ├── hwatu/ seotda/ gostop/ poker/   # 카드 모델·순수 함수 엔진
│   ├── game/           # 방·판 상태머신 + 테이블·로비·모니터 UI
│   ├── betting/ budget/ ranking/       # 베팅·바이인·랭킹
│   ├── jokbo-advisor/  # 수동 피커 + vision
│   └── auth/           # 계정·역할·관리자
├── lib/                # env·db·auth·realtime·sound
└── components/         # 공용 UI (버튼·스테퍼·아바타·화투 카드)

drizzle/                # 스키마 (typed source of truth)
supabase/migrations/    # RLS·realtime SQL
dockerfiles/            # Dockerfile.nextjs
```

## 🛠️ 명령어

```bash
pnpm dev            # 개발 서버
pnpm typecheck      # tsc --noEmit
pnpm lint           # eslint
pnpm test           # vitest (단위)
pnpm test:e2e       # Playwright 모바일 공개 화면 스모크 (DB 없이 실행)
pnpm db:generate    # drizzle 마이그레이션 생성
pnpm db:migrate     # 생성된 마이그레이션 순차 적용
```

## 📦 배포

`v*` 태그 push → [deploy.yml](.github/workflows/deploy.yml)(docker-deploy-control-hub v2)이
이미지 빌드 후 프로덕션(`kkeutbal.kanduit.app`) 배포. 품질 게이트는
[ci.yml](.github/workflows/ci.yml)(typecheck·lint·test)이 모든 push에서 돕니다.
`keep-alive.yml`은 Supabase 무료 티어 슬립을 방지합니다.

## 📚 문서

| 문서 | 내용 |
|------|------|
| [`docs/01-architecture.md`](docs/01-architecture.md) | 스택·배포 토폴로지·모듈 경계 |
| [`docs/02-data-model.md`](docs/02-data-model.md) | Postgres 스키마·불변식·RLS |
| [`docs/03-realtime-protocol.md`](docs/03-realtime-protocol.md) | 채널·이벤트 스키마·상태 동기화 |
| [`docs/04-game-engines.md`](docs/04-game-engines.md) | 화투 카드 모델·섯다 끗·고스톱 점수 |
| [`docs/07-auth-and-security.md`](docs/07-auth-and-security.md) | 인증·역할·보안 경계 |
| [`docs/08-database-migrations.md`](docs/08-database-migrations.md) | DB 적용·검증·복구 런북 |
| [`docs/09-roadmap.md`](docs/09-roadmap.md) | 우선순위·마일스톤 |
| [`docs/10-virtual-credit-and-fair-play.md`](docs/10-virtual-credit-and-fair-play.md) | 전역 가상 크레딧·공정 셔플 확장 설계 |

실행 잔여 작업: [`TODO.md`](TODO.md) · 에이전트 가이드: [`CLAUDE.md`](CLAUDE.md)

## 📄 라이선스

[MIT](LICENSE) © 2026 kanduit-lab — 화투 도안: CC BY-SA 4.0
([출처](public/cards/ATTRIBUTION.md))
