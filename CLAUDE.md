# CLAUDE.md — 끗발 (Kkeutbal)

에이전트가 이 저장소에서 작업할 때 먼저 읽는 가이드. 상세는 `docs/` 참조.

## 프로젝트

판돈 없이 즐기는 **섯다·고스톱(화투 48장 기반)·포커(트럼프 52장)** 실시간 판 기록·베팅·랭킹·족보 트래커.
MT/모임에서 공용 칩을 쓰면 승패 기록이 안 남는 문제를 푼다.
방에 모인 사람들이 각자 폰으로 베팅·결과를 입력 → 전원 화면 실시간 동기화 → 판 종료 시 손익·랭킹 자동 집계.
게임 종류(`seotda`/`gostop`/`poker`)와 무관하게 방·베팅·랭킹 흐름은 공통이다.

## 스택

| 레이어 | 선택                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 앱     | Next.js 16 App Router, TypeScript strict, RSC + Server Actions, `output: 'standalone'`                                                                                                                                                                                                                                                                                                                                                                         |
| 실시간 | Supabase Realtime **Broadcast** 공개 채널(`room:{uuid}`, publishable key)                                                                                                                                                                                                                                                                                                                                                                                      |
| DB     | PostgreSQL(Supabase) + Drizzle ORM. 전용 롤 `kkeutbal_app`(bypassrls)로 pooler(session mode, 5432) 직결. RLS는 anon/authenticated 대상 방어층일 뿐, 실제 권한 검사는 Server Action이 한다                                                                                                                                                                                                                                                                      |
| 인증   | Auth.js v5, 3개 경로: `password`(내부 계정 — username·bcrypt·phone, `local:{username}` sub) · Authentik OIDC(관리자 콘솔에서 연결, IdP가 검증한 전화번호가 미연결 내부 계정 하나와 일치할 때만 자동 연결 — 아이디 기반 병합은 계정 탈취 경로여서 제거) · `guest-token`(관리자 발급 토큰+이름, `guest:{tokenId}:{name}` sub). 최초 관리자는 서버 콘솔의 10분짜리 설정 코드로 생성하고, 이후 회원가입은 관리자가 발급·회수하는 `registration_codes` 검증 뒤에만 열린다. 관리자 판정은 `users.is_admin` |
| Vision | `@anthropic-ai/sdk` + `@google/genai`. API key는 환경변수에만 두고, 관리자 콘솔이 공급자(Anthropic/Gemini)·모델·활성 상태를 관리한다. 인식 실패 시 수동 피커로 폴백                                                                                                                                                                                                                                                                       |
| 배포   | kanduit-lab `docker-deploy-control-hub` v2 (`.github/workflows/deploy.yml`, `.deploy.yml`), 전용 서버 없음. `dockerfiles/Dockerfile.nextjs`                                                                                                                                                                                                                                                                                                                    |

**중요**: 라이브 액션은 Postgres Changes가 아니라 **Broadcast**를 쓴다. 행동한 클라이언트가
Server Action 성공 후 이벤트를 직접 send하고, 수신자는 그 이벤트를 힌트로만 쓰고 진실은
스냅샷 refetch(`refreshRoom`, 250ms 디바운스·이벤트 유래 최소 1초 간격 + 20초 폴링 +
`visibilitychange`/`online`/`pageshow`, CLOSED 시 백오프 자동 재구독)로 확인한다.
private 채널·RLS realtime 정책은 마이그레이션에 존재하나 현재 미사용. 이유·프로토콜 상세는
`docs/03-realtime-protocol.md`. 이 경계를 바꾸려면 문서부터 갱신할 것.

## 구조

```
src/
├── app/                # 라우트·레이아웃·API 라우트
│   ├── (home)/         # 로그인 후 첫 화면 (방 입장·참여 중인 방)
│   ├── api/auth, api/health
│   ├── login, register, about, admin, wallet
│   ├── rooms/new, rooms/[code]              # + [code]/monitor·settings·result·fairness/[seq]
│   ├── advisor, ranking, ranking/player/[id]
│   ├── guide, guide/{seotda,gostop,poker,usage}   # 정적 규칙·사용법 (본문은 한국어 고정)
│   └── manifest.ts, error.tsx, not-found.tsx, loading.tsx
├── features/           # 도메인 모듈 (경계 = 폴더)
│   ├── hwatu/          # 화투 48장 카드 모델 (섯다·고스톱 공통 기반)
│   ├── seotda/         # 섯다 끗/족보 엔진 (순수 함수)
│   ├── gostop/         # 고스톱 점수 엔진 (순수 함수)
│   ├── poker/          # 포커 카드 모델(52장)·족보 엔진 (순수 함수)
│   ├── game/           # 방·세션·라운드 상태머신 — actions(방)·round-actions(판)·member-actions(역할)
│   ├── betting/        # 베팅 액션·승인 플로우
│   ├── fairness/       # commit-reveal 시드·영수증·덱 재계산
│   ├── ranking/        # 승패·랭킹 집계·정산 이체 계산
│   ├── budget/         # 개인 예산·바이인
│   ├── wallet/         # 계정 귀속 가상 크레딧·관리자 조정
│   ├── promotions/     # 공지 배너·팝업
│   ├── jokbo-advisor/  # 수동 피커 + vision 인식 + 통계
│   └── auth/           # 세션·역할·관리자 (actions, admin-actions, roles)
├── lib/                # env·db·auth·i18n/·realtime/·supabase/ 공용 인프라
└── components/         # ui/ 프리미티브 배럴 + 화투·포커 카드·QR·로케일 스위처
drizzle/schema.ts       # 스키마 (typed source of truth)
drizzle/migrations/     # 테이블·인덱스·제약 (drizzle-kit)
supabase/migrations/    # RLS·grant·트리거·함수 (drizzle 관리 밖)
docs/                   # 설계 문서
```

`groups`/`group_members`/`hand_records`는 2026-07-23 스키마에서 제거됐다 — 누적 랭킹은
전역 사용자 단위, 어드바이저 판독 결과는 저장하지 않는 것이 확정 동작이다.

## 명령어

```bash
pnpm dev            # 개발 서버
pnpm typecheck      # tsc --noEmit
pnpm lint           # eslint
pnpm test           # vitest (단위 + jsdom 컴포넌트)
pnpm db:generate    # drizzle 마이그레이션 생성
pnpm db:push        # 스키마 반영
```

**빌드(`pnpm build`)는 사용자가 실행한다.** 에이전트는 코드 수정·오류 분석 담당.
단위 테스트·lint·typecheck 같은 가벼운 격리 검사는 에이전트가 직접 돌려도 된다.

## 도메인 용어집

게임 용어는 **번역하지 말고 원어 그대로** 쓴다 (코드 식별자 포함).

| 용어              | 뜻                                                        |
| ----------------- | --------------------------------------------------------- |
| 화투(hwatu)       | 48장 카드. 12개월 × 4장. 섯다는 1~10월 20장 부분집합 사용 |
| 끗(kkeut)         | 섯다 점수. 두 장 합의 일의 자리 (0끗=망통 ~ 9끗)          |
| 땡(ttaeng)        | 같은 월 2장. 장땡(10)이 최상위                            |
| 광땡(gwangttaeng) | 광 2장 조합. 최상위 족보                                  |
| 특수패            | 알리·독사·구삥·장삥·장사·세륙 등 끗보다 우선하는 조합     |
| 광(gwang)         | 밝은 패. 고스톱 점수 핵심                                 |
| 피(pi)            | 고스톱 껍데기 패. 쌍피 포함                               |
| 고(go)/스톱(stop) | 고스톱에서 판 계속/종료 선언                              |
| 판(pan)           | 한 판 = 라운드                                            |
| 방(room)          | 실시간 세션 단위                                          |

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
