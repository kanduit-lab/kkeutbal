# CLAUDE.md — 끗발 (Kkeutbal)

에이전트가 이 저장소에서 작업할 때 먼저 읽는 가이드. 상세는 `docs/` 참조.

## 프로젝트

판돈 없이 즐기는 **화투(섯다·고스톱)** 실시간 판 기록·베팅·랭킹·족보 트래커.
MT/모임에서 공용 칩을 쓰면 승패 기록이 안 남는 문제를 푼다.
방에 모인 사람들이 각자 폰으로 베팅·결과를 입력 → 전원 화면 실시간 동기화 → 판 종료 시 손익·랭킹 자동 집계.

## 스택

| 레이어 | 선택 |
|--------|------|
| 앱 | Next.js 15 App Router, TypeScript strict, RSC + Server Actions |
| 실시간 | Supabase Realtime **Broadcast**(라이브 액션) + **Presence**(접속자) |
| DB | PostgreSQL (Supabase) + Drizzle ORM, RLS로 방 격리 |
| 인증 | Auth.js v5 + Authentik OIDC (전체 로그인 전제) |
| Vision | Anthropic Claude `claude-sonnet-5` (족보 사진 인식) |
| 배포 | Vercel + Supabase (전용 서버 없음) |

**중요**: 라이브 액션은 Postgres Changes가 아니라 **Broadcast**를 쓴다. 이유·프로토콜은
`docs/03-realtime-protocol.md`. 이 경계를 바꾸려면 문서부터 갱신할 것.

## 구조

```
src/
├── app/                # 라우트·레이아웃·서버 액션
├── features/           # 도메인 모듈 (경계 = 폴더)
│   ├── hwatu/          # 화투 48장 카드 모델 (섯다·고스톱 공통 기반)
│   ├── seotda/         # 섯다 끗/족보 엔진 (순수 함수)
│   ├── gostop/         # 고스톱 점수 엔진 (순수 함수)
│   ├── game/           # 방·세션·라운드 상태머신
│   ├── betting/        # 베팅 액션·승인 플로우
│   ├── ranking/        # 승패·랭킹 집계
│   ├── budget/         # 개인 예산·바이인
│   ├── jokbo-advisor/  # 수동 피커 + vision 인식
│   └── auth/           # 역할·권한
├── lib/                # env·supabase·auth·realtime 등 공용 인프라
└── components/         # 공용 UI
drizzle/                # 스키마 (typed source of truth)
supabase/migrations/    # RLS·realtime SQL
docs/                   # 설계 문서
```

## 명령어

```bash
pnpm dev            # 개발 서버
pnpm typecheck      # tsc --noEmit
pnpm lint           # eslint
pnpm test           # vitest (단위)
pnpm test:e2e       # playwright
pnpm db:generate    # drizzle 마이그레이션 생성
pnpm db:push        # 스키마 반영
```

**빌드(`pnpm build`)는 사용자가 실행한다.** 에이전트는 코드 수정·오류 분석 담당.
단위 테스트·lint·typecheck 같은 가벼운 격리 검사는 에이전트가 직접 돌려도 된다.

## 도메인 용어집

게임 용어는 **번역하지 말고 원어 그대로** 쓴다 (코드 식별자 포함).

| 용어 | 뜻 |
|------|-----|
| 화투(hwatu) | 48장 카드. 12개월 × 4장. 섯다는 1~10월 20장 부분집합 사용 |
| 끗(kkeut) | 섯다 점수. 두 장 합의 일의 자리 (0끗=망통 ~ 9끗) |
| 땡(ttaeng) | 같은 월 2장. 장땡(10)이 최상위 |
| 광땡(gwangttaeng) | 광 2장 조합. 최상위 족보 |
| 특수패 | 알리·독사·구삥·장삥·장사·세륙 등 끗보다 우선하는 조합 |
| 광(gwang) | 밝은 패. 고스톱 점수 핵심 |
| 피(pi) | 고스톱 껍데기 패. 쌍피 포함 |
| 고(go)/스톱(stop) | 고스톱에서 판 계속/종료 선언 |
| 판(pan) | 한 판 = 라운드 |
| 방(room) | 실시간 세션 단위 |

## 컨벤션

- 글로벌 규칙(`~/.claude/rules/`, 스킬 `doc-rules`/`ui-rules`/`review-rules`/`code-patterns`)이 우선.
- **불변성**: 함수 인자·props·공유 state 절대 변형 금지. 로컬 accumulator는 변형 허용.
- 파일 200~400줄 기본, 800줄 상한. 도메인별 분리.
- 게임 엔진은 **순수 함수**로 유지 — I/O·DB 접근 금지. 테스트 가능성이 핵심.
- 모든 외부 입력은 `zod`로 검증 (realtime 이벤트 payload 포함).
- 비밀값 하드코딩 금지. `src/lib/env.ts`에서 검증된 env만 사용.

## Git

- `master` — 베이스. 초기 커밋만 존재.
- `develop` — 기본 개발 브랜치. 여기서 분기·병합.
- 커밋: `type: lowercase description` (feat/fix/refactor/docs/test/chore/perf/ci), 영문.

## 문서

작업 전 관련 문서를 읽고, 설계가 바뀌면 문서를 먼저 갱신한다.
인덱스는 [`README.md`](README.md) 하단, 실행 잔여 작업은 [`TODO.md`](TODO.md).
