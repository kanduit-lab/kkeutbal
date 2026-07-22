# CLAUDE.md — 끗발 (Kkeutbal)

에이전트가 이 저장소에서 작업할 때 먼저 읽는 가이드. 상세는 `docs/` 참조.

## 프로젝트

판돈 없이 즐기는 **섯다·고스톱(화투 48장 기반)·포커(트럼프 52장)** 실시간 판 기록·베팅·랭킹·족보 트래커.
MT/모임에서 공용 칩을 쓰면 승패 기록이 안 남는 문제를 푼다.
방에 모인 사람들이 각자 폰으로 베팅·결과를 입력 → 전원 화면 실시간 동기화 → 판 종료 시 손익·랭킹 자동 집계.
게임 종류(`seotda`/`gostop`/`poker`)와 무관하게 방·베팅·랭킹 흐름은 공통이다.

## 스택

| 레이어 | 선택 |
|--------|------|
| 앱 | Next.js 15 App Router, TypeScript strict, RSC + Server Actions, `output: 'standalone'` |
| 실시간 | Supabase Realtime **Broadcast** 공개 채널(`room:{uuid}`, anon key) |
| DB | PostgreSQL(Supabase) + Drizzle ORM. 전용 롤 `kkeutbal_app`(bypassrls)로 pooler(session mode, 5432) 직결. RLS는 anon/authenticated 대상 방어층일 뿐, 실제 권한 검사는 Server Action이 한다 |
| 인증 | Auth.js v5. Authentik OIDC는 `AUTH_AUTHENTIK_*` 3종 env가 모두 있을 때만 활성. `AUTH_DEV_LOGIN=true`면 이름만으로 로그인하는 게스트 provider 추가(`dev:{name}` sub, 동명이인=동일 계정) |
| Vision | `@anthropic-ai/sdk`, 모델은 `JOKBO_VISION_MODEL` env(기본 `claude-sonnet-5`). 족보 사진 인식 실패 시 수동 피커로 폴백 |
| 배포 | kanduit-lab `docker-deploy-control-hub` v2 (`.github/workflows/deploy.yml`, `.deploy.yml`), 전용 서버 없음. `dockerfiles/Dockerfile.nextjs` |

**중요**: 라이브 액션은 Postgres Changes가 아니라 **Broadcast**를 쓴다. 행동한 클라이언트가
Server Action 성공 후 이벤트를 직접 send하고, 수신자는 그 이벤트를 힌트로만 쓰고 진실은
스냅샷 refetch(`refreshRoom`, 250ms 디바운스 + 20초 폴링 + `visibilitychange`)로 확인한다.
private 채널·RLS realtime 정책은 마이그레이션에 존재하나 현재 미사용. 이유·프로토콜 상세는
`docs/03-realtime-protocol.md`. 이 경계를 바꾸려면 문서부터 갱신할 것.

## 구조

```
src/
├── app/                # 라우트·레이아웃·API 라우트
│   ├── api/auth, api/health
│   ├── login, rooms, rooms/[code], rooms/new, advisor, ranking
│   └── guide, guide/seotda, guide/gostop, guide/poker, guide/usage  # 정적 규칙·사용법 가이드
├── features/           # 도메인 모듈 (경계 = 폴더)
│   ├── hwatu/          # 화투 48장 카드 모델 (섯다·고스톱 공통 기반)
│   ├── seotda/         # 섯다 끗/족보 엔진 (순수 함수)
│   ├── gostop/         # 고스톱 점수 엔진 (순수 함수)
│   ├── poker/          # 포커 카드 모델(52장)·족보 엔진 (순수 함수)
│   ├── game/           # 방·세션·라운드 상태머신 (components/ 포함)
│   ├── betting/        # 베팅 액션·승인 플로우
│   ├── ranking/        # 승패·랭킹 집계
│   ├── budget/         # 개인 예산·바이인
│   ├── jokbo-advisor/  # 수동 피커 + vision 인식 + 통계 (components/, vision/, stats.ts)
│   └── auth/           # 역할·권한
├── lib/                # env·db·auth·realtime/·supabase/ 등 공용 인프라
└── components/         # 공용 UI (hwatu-card.tsx — 화투 카드 CSS/이모지 비주얼)
drizzle/schema.ts       # 스키마 (typed source of truth)
supabase/migrations/    # RLS·realtime SQL
docs/                   # 설계 문서
```

`groups`/`group_members` 테이블은 스키마에만 존재, 아직 기능 미구현.
`handRecords`는 어드바이저 결과 저장용으로 스키마에 있으나 현재 어드바이저는 저장하지 않는다.

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
