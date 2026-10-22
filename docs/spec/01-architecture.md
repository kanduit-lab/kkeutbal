# 아키텍처

| Field           | Value                                                      |
| --------------- | ---------------------------------------------------------- |
| Type            | technical-design                                           |
| Audience        | engineering / reviewers / operators                        |
| Status          | active                                                     |
| Source of truth | 구현은 코드·스키마, 이 문서는 스택·배포 토폴로지·모듈 경계 |
| Last reviewed   | 2026-10-22                                                 |

## Context

실물 화투판 옆에서 돌아가는 실시간 다중 참가 기록 앱이다. 제약:

- 참가자는 전부 모바일 브라우저. 설치 없이 링크/QR로 들어온다.
- 사용자는 내부 계정·관리자 발급 게스트 토큰으로 로그인하며, Authentik SSO는 관리자가 연결할 수 있다.
- 동시 사용 규모는 방당 2~10명, 동시 방 수 한 자릿수. 부하가 아니라 지연이 품질을 좌우한다.
- 배포 자동화는 없으며, standalone Docker 이미지는 운영자가 선택한 환경에서 직접 실행한다.

## Goals

- 액션 반영 지연 체감 300ms 내외 — 브로드캐스트 직후 로컬 반영 + 스냅샷 refetch로 정합.
- 서버 상시 상태 없이 Next.js 인스턴스 하나로 끝낸다 (stateful 게임 서버 없음).
- 게임 규칙 로직은 순수 함수로 격리해 단위 테스트 가능하게 한다.
- DB 쓰기 권한은 서비스 키/JWT 브리지 없이 서버 롤 하나로 통제한다.

## Non-goals

- 수평 확장·리전 분산·고가용성 설계.
- 별도 WebSocket 서버나 메시지 브로커 운영.
- 오프라인 우선(offline-first) 완전 동기화. 재접속 시 스냅샷 복원까지만 한다.
- Postgres Changes 기반 realtime — Broadcast만 쓴다.

## Current State

런타임 구현 진행 중. 도메인 엔진(`hwatu`/`seotda`/`gostop`), 방·베팅·예산·랭킹 Server Action,
realtime 클라이언트, auth, vision 어드바이저까지 코드가 존재한다. Drizzle은 테이블 DDL을,
`database/migrations/supabase/0007_database_hardening.sql`은 현 스키마의 RLS·권한·원장 트리거를 소유한다.

## Design

### 배포 토폴로지

```
 ┌─────────────┐   OIDC(선택)   ┌──────────────┐
 │  브라우저   │◄──────────────►│  Authentik   │  (사용자 자체 운영, 미등록 시 비활성)
 │ (모바일 웹) │                └──────────────┘
 └──────┬──────┘
        │ HTTPS (SSR/RSC, Server Actions)
        ▼
 ┌────────────────────────────────────────┐
 │  Next.js 16 (standalone) 컨테이너       │
 │  운영 환경에서 수동으로 기동             │
 └──────┬───────────────────────────────┬──┘
        │ postgres-js                 │ REALTIME_MODE=supabase일 때
        ▼                             ▼
 ┌───────────────────┐       ┌────────────────────────┐
 │ PostgreSQL        │       │ Supabase Realtime      │
 │ 앱 데이터         │       │ Broadcast + Presence   │
 │ LISTEN/NOTIFY     │       │ 선택 경로              │
 │ presence lease    │       └────────────────────────┘
 └───────────────────┘
```

전용 게임 서버를 두지 않는다는 원제약은 유지한다. Next.js는 `output: 'standalone'`으로 빌드해 `Dockerfile`이
`.next/standalone` + `node server.js`를 그대로 컨테이너에 담는다(`next.config.ts`).

### DB 접근 — 전용 앱 롤, service role key 안 씀

`src/lib/db.ts`가 서버 전용 Drizzle 클라이언트를 만든다.

- `DATABASE_POOL_MODE=session|transaction`이 prepared statement 사용 여부를 정한다. 포트 번호로
  연결 방식을 추론하지 않는다.
- `DATABASE_TLS_MODE=disable|verify-system|verify-ca`가 TLS 검증 방식을 정한다. 사용자 지정 CA는
  `verify-ca`에서만 필요하다.
- self realtime listener는 세션 연결을 사용한다. 기본 연결이 transaction pool이면
  `DATABASE_LISTENER_URL`로 별도 연결을 제공한다.
- 전용 롤 `kkeutbal_app`, 속성 `bypassrls`.

즉 Supabase `service_role` 키도, Auth.js 세션을 Supabase JWT로 바꿔 넘기는 브리지도 쓰지 않는다.
서버 프로세스가 DB에 접속하는 통로는 이 롤 하나뿐이고, RLS(`database/migrations/supabase/0007_database_hardening.sql`)는
`anon`/`authenticated`의 Data API 접근을 차단한다 — 실제 권한 판정(방 참가자인지, 딜러인지, 잔액이
충분한지)은 각 도메인 `actions.ts`의 Server Action이 수행한다. RLS를 우회하는 롤이 유일한 쓰기
경로이므로, **Server Action의 권한 검사를 건너뛰면 DB 레벨 방어가 없다**는 점이 이 설계의 핵심
트레이드오프다.

커넥션은 `globalThis` 캐시로 dev HMR 재생성을 막고, 두 모드 모두 `idle_timeout: 30s`를 둔다.
공지·SSO 노출 여부·첫 계정 안내처럼 **읽기 실패가 공개 로그인 화면을 막으면 안 되는** 기능만
`src/lib/optional-database.ts`를 통해 DB 모듈을 지연 로드한다. 초기화 실패는 프로세스당 한 번만
경고하고 빈 공지·SSO 미설정·첫 계정 아님으로 폴백한다. 쓰기·권한 검사 경로는 이 폴백을 쓰지
않으며 DB 오류를 일반 실패로 처리한다.

### Auth — 관리자 설정 SSO, 가입코드 검증

`src/lib/auth.ts` / `src/lib/auth-config.ts`:

- 관리자가 `/admin`의 SSO 설정에서 Authentik Issuer URL·Client ID·Client secret을 저장하고
  활성화하면 provider 목록에 들어간다(`hasAuthentik()`). secret은 `AUTH_SECRET` 기반 AES-GCM
  암호문으로 `auth_settings`에만 저장하며, 환경 변수로 받지 않는다.
- 회원가입은 관리자가 `/admin`에서 발급한 `registration_codes`의 해시를 서버에서 확인한 뒤에만
  연다. 단, 계정이 하나도 없는 첫 실행은 예외로 가입코드 없이 `/register`를 열고, 첫 계정은
  트랜잭션 안에서 자동으로 관리자가 된다. 일반 가입코드가 확인되면 10분짜리 서명된 HTTP-only
  쿠키가 발급되고, `/register` 페이지와 `registerAndLogin` 액션이 모두 이를 확인한다.
- `jwt` 콜백에서 최초 로그인 시 `public.users`에 upsert(`authentikSub` 충돌 시 갱신) 하고
  내부 id를 `token.uid`에 싣는다. 이후 모든 서버 컨텍스트는 `session.user.id`로 이 내부 id를
  쓴다.
- `authConfigBase`(`auth-config.ts`)는 edge-safe 부분만 분리해 둔 것 — DB(postgres-js)를 물지
  않아 proxy 번들에 안전하게 들어간다. `src/proxy.ts`는 이 설정만으로 NextAuth 인스턴스를
  만들어 JWT 쿠키 유무만 검사한다. `/`, `/rooms`, `/ranking`, `/advisor`, `/admin`, `/wallet`만 로그인으로
  유도하고 나머지 경로는 공개 페이지 또는 App Router 404로 둔다. **미들웨어는 UX 게이트일 뿐이며
  실제 권한 검사는 하지 않는다** — 각 Server Action이 다시 세션을 확인한다.

### 실시간 전략 — 교체 가능한 전송 + 스냅샷 truth

`src/lib/realtime`의 공통 connection이 `REALTIME_MODE`에 따라 Supabase 또는 self 전송을 고른다.
브라우저는 런타임 설정 API를 읽으므로 Supabase 공개 연결 값이 이미지에 고정되지 않는다.

- `supabase`: 공개 Broadcast 채널과 Presence를 사용한다. Supabase 클라이언트는 DB 조회나 Auth에
  쓰지 않는다.
- `self`: 인증된 same-origin SSE와 POST, PostgreSQL `LISTEN/NOTIFY`, 만료형 DB presence lease를
  사용한다. 서버가 세션에서 actor를 정하고 방 멤버십을 검사한다.

어느 모드에서도 이벤트는 "다시 읽어라"는 힌트다. 실제 상태는 `refreshRoom()`이 반환한 서버
스냅샷으로 확정한다. 이벤트 유실과 중복은 폴링과 재조회가 복구한다. 상세 계약은
`03-realtime-protocol.md`가 소유한다.

**refetch 트리거**:

| 트리거         | 조건                                                        |
| -------------- | ----------------------------------------------------------- |
| 이벤트 수신    | 정책에 따라 즉시(`round.*`) / 넘김 / 합침 — 250ms 디바운스  |
| Presence sync  | 모르는 참가자 id가 나타날 때만 refetch                      |
| 구독 성공 직후 | 공통 connection의 `SUBSCRIBED` 상태에서 즉시 refetch       |
| 폴링           | 탭이 visible일 때 20초 간격 `setInterval`                   |
| 가시성·연결 복귀 | `visibilitychange`/`online`/`pageshow`에서 즉시 refetch    |

payload는 envelope와 이벤트별 zod 스키마로 검증한다. 실패한 이벤트는 버리고 스냅샷 경로로
복구한다.

### 쓰기 경로

```
1. 사용자 탭
2. Server Action 호출 — 권한 검사, 도메인 엔진 판정, DB 커밋 (칩 관련은 방 단위
   pg_advisory_xact_lock 으로 동시 갱신 직렬화)
3. 성공 응답을 받은 클라이언트가 공통 realtime connection으로 이벤트 힌트를 발행
4. 다른 클라이언트는 이벤트를 힌트로 debouncedRefetch() → refreshRoom() 스냅샷으로 정합
```

Vercel 배포를 전제로 했던 "로컬 optimistic 반영 → 브로드캐스트 → 서버 확정" 3~5단계 설계는
폐기됐다. 지금은 서버 확정이 끝난 뒤에야 이벤트가 나간다 — 화면 반응은 각 클라이언트의 자체
Server Action 응답으로, 다른 참가자 화면 동기화는 이벤트+스냅샷으로 나눠 처리한다.

베팅 멱등키는 클라이언트가 생성한 UUID를 PK로 써서 중복 제출·재전송을 흡수한다
(`src/features/betting/actions.ts`).

### 모듈 경계

```
src/features/<domain>/       도메인별 폴더가 경계
  ├ types.ts                 도메인 타입 (외부 의존 없음)
  ├ <engine>.ts              순수 함수. I/O 금지
  ├ *.test.ts                엔진 단위 테스트
  ├ actions.ts / queries.ts  Server Actions (권한 검사 + 영속화 + refetch용 쿼리)
  └ components/              해당 도메인 전용 UI
```

현재 도메인: `hwatu`(카드 모델, 최하위 공용), `seotda`(끗/족보 엔진), `gostop`(점수 엔진),
`game`(방·세션·라운드, room-code 발급, 컴포넌트 다수),
`betting`(베팅 액션·규칙), `fairness`(commit-reveal 시드·영수증·덱 재계산), `budget`(예산),
`wallet`(계정 귀속 가상 크레딧), `ranking`(랭킹 조회), `promotions`(공지 배너·팝업),
`jokbo-advisor`(vision + 수동 피커), `auth`(세션·역할·관리자).

파일이 400줄을 넘으면 책임 단위로 쪼개고 `actions.ts`/`queries.ts`를 배럴로 남긴다
(`game/queries.ts`, `ranking/queries.ts`, `fairness/receipt.ts`가 그런 배럴이다). 그래서 문서에
적힌 `<domain>/queries.ts` 같은 경로는 진입점이고, 구현은 그 옆 모듈에 있을 수 있다.

규칙:

- `features/hwatu`는 다른 feature를 import하지 않는다.
- `features/seotda`, `features/gostop`은 카드 모델만 의존한다. 서로 의존 금지.
- 엔진(순수 함수)은 `lib/`, `app/`, DB, fetch를 import하지 않는다.
- DB 접근은 `lib/db`와 각 도메인 `actions.ts`/`queries.ts`에서만 한다. 컴포넌트에서 직접
  쿼리 금지.
- **`'use server'` 파일은 async 함수만 export한다.** 그 파일의 모든 export가 클라이언트에서
  호출 가능한 엔드포인트가 되기 때문이다. zod 스키마 같은 값을 하나 export하면 그 번들의 액션
  **전부**가 죽고(로그인이 500으로 떨어진 실제 사고), `export { x } from './y'` 재export는 내부
  헬퍼를 무인증 엔드포인트로 공개한다. 공유할 값은 `'use server'`가 아닌 파일에 둔다
  (`features/auth/schemas.ts`가 그 이유로 생겼다). 타입·lint·단위 테스트는 이걸 못 잡는다.
- `lib/auth-config.ts`(edge-safe)와 `lib/auth.ts`(DB 포함)는 분리 유지 — 미들웨어는 전자만
  import한다.

### 기술 선택 요약

| 레이어        | 선택                                               | 근거                                                                                       |
| ------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 앱 프레임워크 | Next.js 16 App Router, `output: 'standalone'`      | SSR로 초기 방 상태를 즉시 그림. standalone 산출물을 docker 이미지에 그대로 담는다          |
| 언어          | TypeScript strict                                  | 카드 배열 인덱싱이 많아 undefined 누락이 실제 버그 원인이 됨                               |
| 실시간        | Supabase 또는 PostgreSQL self 전송                 | 배포 환경에 따라 고르고, 두 모드 모두 스냅샷 재검증으로 수렴                              |
| DB 접근       | Drizzle ORM + postgres-js, 전용 롤(bypassrls)      | 스키마를 타입 소스로. service role key/JWT 브리지 없이 커넥션 문자열 하나로 통제           |
| 인증          | Auth.js v5, Authentik 선택적 + 게스트 로그인       | Authentik 미등록 상태에서도 개발·현장 운영 가능                                            |
| 검증          | zod                                                | realtime payload·env·폼 입력 단일 검증 수단                                                |
| 배포          | Docker standalone 이미지                           | 자동 배포 경로 없이 운영자가 이미지를 직접 실행                                             |
| Vision        | Anthropic Claude 또는 Gemini(`vision_settings`)    | API key는 환경변수에만 두고, 관리자 콘솔에서 공급자·모델·활성화와 키의 준비 상태를 관리 |

## Alternatives Considered

### A. 자체 Node + Socket.IO 서버

- 기각 사유: 별도 stateful WebSocket 서비스를 하나 더 운영할 필요가 없다. self 모드는 기존
  Next.js 프로세스의 인증된 SSE/POST와 PostgreSQL `LISTEN/NOTIFY`를 재사용한다.

### B. `realtime.messages` RLS + `private: true` 채널

- 애초 설계(구 버전 문서)였으나 구현하지 않았다. 채널 구독 시 RLS 평가 비용과 Authentik/게스트
  로그인이 뒤섞인 신원 모델을 Supabase 세션에 연결하는 작업이 필요해 뒤로 미뤘다.
- 대신 공개 채널 + UUID 토픽 난독화 + 클라이언트 zod 검증 + 서버 스냅샷 재검증으로 방어한다.
  민감 데이터(칩 금액 등)가 이벤트 payload에 실려 나가는 게 이 대안의 실질적 노출면이다 —
  `03-realtime-protocol.md`에서 payload 최소화 원칙을 다룬다.

### C. Supabase Postgres Changes로 전체 동기화

- 기각 사유: 변경 행마다 구독자별 권한 평가 비용, WAL 복제 지연. 재접속 복원은 이미 Postgres
  스냅샷 refetch로 대체하고 있어 CDC가 추가 이점을 주지 않는다.

### D. Vercel + service role key

- 기각 사유: 실제로는 Vercel을 쓰지 않는다(사용자 self-hosted 인프라 사용). service role key도
  쓰지 않는다 — 전용 앱 롤(`kkeutbal_app`, bypassrls)로 대체해 키 하나를 덜 관리한다.

## Data / API / Permission Changes

- 스키마 소유: `02-data-model.md` (drizzle `database/schema.ts`가 source of truth, SQL은
  `database/migrations/drizzle/` + `database/migrations/supabase/`).
- RLS는 `anon`/`authenticated` 대상 방어층. 실질적 권한 판정은 Server Action.
- `kkeutbal_app`은 RLS를 우회하지만 DML과 시퀀스 사용 권한만 가진다. 정책·권한 기준은
  `0007_database_hardening.sql`이다.
- 외부 공개 REST API는 없다. 클라이언트 진입점은 Server Actions와 인증된 realtime API다.
  Supabase 모드에서만 공개 Broadcast 채널을 추가로 사용한다.

## Migration And Rollout

1. [`../runbooks/01-database-migrations.md`](../runbooks/01-database-migrations.md) 순서로 `pnpm db:migrate`와
   Supabase 보안 SQL을 적용한다. `db:push`는 운영 반영 경로로 사용하지 않는다.
2. `database/migrations/supabase/0007_database_hardening.sql`은 새 DB의 현재 RLS baseline이고,
   `0008_rate_limit_buckets_rls.sql`은 기존 DB에 신규 내부 테이블 권한을 보강한다.
3. Authentik 애플리케이션에 `{APP_URL}/api/auth/callback/authentik`을 Redirect URI로 등록하고,
   초기 관리자 계정으로 `/admin`의 SSO 설정을 저장·활성화.
4. **자동 배포 경로가 없다.** `Dockerfile`로 이미지를 만들고 운영 환경에 실행한다. 런타임 비밀값은
   프로세스 환경에서 제공하며, 상태 점검은 `/api/health`와 `/api/ready`를 사용한다.
5. 실제 MT 전에 2대 이상 기기로 리허설 1회 — 동기화·재접속·정산 확인.

롤백: 이전 docker 이미지 태그로 재배포(수동). 스키마는
초기 단계이므로 파괴적 변경 시 `drizzle-kit generate`로 down 경로를 명시적으로 만든다.

## Verification Plan

| 대상             | 방법                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------- |
| 게임 엔진 정확성 | Vitest 단위 테스트(`*.test.ts`). 섯다는 20장 조합 대조                                    |
| 칩 보존 불변식   | `chip_ledger` 기반 잔액 = delta 합. 세션 정산 시 순손익 합계 0 검증                       |
| 실시간 지연      | 2개 브라우저에서 액션 뒤 화면 반영 시간을 수동으로 확인 |
| 재접속 복원      | 소켓 강제 종료 후 `refreshRoom` 스냅샷 일치 확인                                          |
| 권한 격리        | 비참가자 세션으로 Server Action 호출 시 거부 확인(RLS는 anon 직접 조회 차단만 검증)       |
| 타입·린트        | `pnpm typecheck`, `pnpm lint`                                                             |
| 빌드             | `pnpm build` — 사용자가 직접 실행(에이전트는 코드 수정·오류 분석만)                       |

## Risks And Mitigations

| 리스크                                                                     | 영향                                             | 완화                                                                                                      |
| -------------------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| 공개 Realtime 채널 — 인증 없이 누구나 `roomId`만 알면 구독·발행 가능       | 칩 금액 등 payload 노출, 위조 이벤트 주입        | UUID 토픽 난독화, zod 검증 실패 시 폐기, 진실은 항상 Server Action 재검증 스냅샷                          |
| `kkeutbal_app`이 bypassrls — Server Action 권한 검사 누락 시 RLS 방어 없음 | 방 데이터 교차 노출                              | 모든 쓰기 경로가 Server Action을 거치도록 코드 리뷰로 강제. 컴포넌트 직접 쿼리 금지 규칙                  |
| 회원가입 코드가 유출됨                                                     | 무단 가입                                        | 관리자가 `/admin`에서 즉시 회수. DB에는 `AUTH_SECRET` 기반 해시만 저장하고, 원문은 발급 직후 한 번만 노출 |
| DB 인증서 미검증                                                           | 중간자 서버에 DB 자격 증명·쿼리가 노출될 수 있음 | 운영에서는 `verify-system` 또는 `verify-ca`를 사용                                                       |
| MT 현장 Wi-Fi/LTE 불안정                                                   | 액션 유실·중복                                   | 멱등키(betting), 폴링+visibilitychange 재동기화, 서버 스냅샷 우선                                         |
| Broadcast 메시지 유실(전달 보장 없음)                                      | 화면 불일치                                      | 이벤트를 힌트로만 쓰고 20초 폴링 + 250ms 디바운스 refetch로 항상 정정                                     |
| Vision 오인식으로 잘못된 족보 안내                                         | 판 분쟁                                          | 인식은 보조. 수동 피커 폴백, 결과 수정 UI 필수                                                            |

## Open Questions

- [ ] Authentik 실등록 일정 — 그 전에도 내부 계정과 게스트 토큰 로그인은 사용 가능.
