# 아키텍처

| Field           | Value                                                      |
| --------------- | ---------------------------------------------------------- |
| Type            | technical-design                                           |
| Audience        | engineering / reviewers / operators                        |
| Status          | active                                                     |
| Source of truth | 구현은 코드·스키마, 이 문서는 스택·배포 토폴로지·모듈 경계 |
| Last reviewed   | 2026-07-30                                                 |

## Context

실물 화투판 옆에서 돌아가는 실시간 다중 참가 기록 앱이다. 제약:

- 참가자는 전부 모바일 브라우저. 설치 없이 링크/QR로 들어온다.
- 사용자는 내부 계정·관리자 발급 게스트 토큰으로 로그인하며, Authentik SSO는 관리자가 연결할 수 있다.
- 동시 사용 규모는 방당 2~10명, 동시 방 수 한 자릿수. 부하가 아니라 지연이 품질을 좌우한다.
- 배포 대상은 Vercel이 아니라 사용자가 운영하는 `kanduit-lab/docker-deploy-control-hub` 기반
  self-hosted docker 인프라다.

## Goals

- 액션 반영 지연 체감 300ms 내외 — 브로드캐스트 직후 로컬 반영 + 스냅샷 refetch로 정합.
- 서버 상시 상태 없이 Next.js 인스턴스 하나로 끝낸다 (stateful 게임 서버 없음).
- 게임 규칙 로직은 순수 함수로 격리해 단위 테스트 가능하게 한다.
- DB 쓰기 권한은 서비스 키/JWT 브리지 없이 서버 롤 하나로 통제한다.

## Non-goals

- 수평 확장·리전 분산·고가용성 설계.
- 자체 WebSocket 서버 운영 — Supabase Realtime을 그대로 쓴다.
- 오프라인 우선(offline-first) 완전 동기화. 재접속 시 스냅샷 복원까지만 한다.
- Postgres Changes 기반 realtime — Broadcast만 쓴다.

## Current State

런타임 구현 진행 중. 도메인 엔진(`hwatu`/`seotda`/`gostop`), 방·베팅·예산·랭킹 Server Action,
realtime 클라이언트, auth, vision 어드바이저까지 코드가 존재한다. Drizzle은 테이블 DDL을,
`supabase/migrations/0007_database_hardening.sql`은 현 스키마의 RLS·권한·원장 트리거를 소유한다.

## Proposed Design

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
 │  docker-deploy-control-hub 로 배포      │
 │  도메인: kkeutbal.kanduit.app           │
 └──────┬───────────────────────────────┬──┘
        │ postgres-js (kkeutbal_app)    │ publishable key (브라우저 직결)
        ▼                               ▼
 ┌──────────────────────────────────────────┐
 │  Supabase                                │
 │  ├ PostgreSQL  : pooler(session 5432 / transaction 6543)│
 │  │   전용 롤 kkeutbal_app (bypassrls)    │
 │  └ Realtime    : Broadcast 공개 채널     │
 │                  room:{uuid}, Presence    │
 └──────────────────────────────────────────┘
```

전용 게임 서버를 두지 않는다는 원제약은 유지하되, 실행 위치는 Vercel이 아니라 사용자 소유
docker 호스트다. Next.js는 `output: 'standalone'`으로 빌드해 `dockerfiles/Dockerfile.nextjs`가
`.next/standalone` + `node server.js`를 그대로 컨테이너에 담는다(`next.config.ts`).

### DB 접근 — 전용 앱 롤, service role key 안 씀

`src/lib/db.ts`가 서버 전용 drizzle 클라이언트를 만든다. 접속 정보는 `DATABASE_URL` 하나이며
가리키는 대상은:

- Supabase pooler. **session mode 5432**에서는 `max: 5`와 prepared statement를 쓰고,
  **transaction mode 6543**에서는 `prepare: false`, `max: 1`로 제약에 맞춘다. 포트로 자동 선택한다.
- `DATABASE_CA_CERT_BASE64`의 Supabase CA로 서버 인증서와 pooler 호스트명을 검증한다.
- 전용 롤 `kkeutbal_app`, 속성 `bypassrls`.

즉 Supabase `service_role` 키도, Auth.js 세션을 Supabase JWT로 바꿔 넘기는 브리지도 쓰지 않는다.
서버 프로세스가 DB에 접속하는 통로는 이 롤 하나뿐이고, RLS(`supabase/migrations/0007_database_hardening.sql`)는
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

### 실시간 전략 — 공개 Broadcast 채널 + 클라이언트 send + 스냅샷 truth

`src/lib/supabase/client.ts`가 브라우저 전용 Supabase 클라이언트를 publishable key로 만든다
(`persistSession: false`, `autoRefreshToken: false` — 이 클라이언트는 DB 조회에 쓰지 않고
Realtime 전용이다). `src/lib/realtime/client.ts` + `events.ts`가 프로토콜을 정의한다. 상세는
`03-realtime-protocol.md`가 소유하며, 여기서는 아키텍처 결정만 적는다.

실제 구현은 애초 설계했던 "`realtime.messages` RLS로 `private: true` 채널 구독 제어"가 **아니다.**
지금 채널은:

- **공개(public) 채널**, 토픽 `room:{roomId}`(`roomTopic()`). `roomId`가 UUID라 추측이 어렵다는
  점에 의존하는 obscurity 방어이며, RLS로 강제되는 접근 제어가 아니다.
- 인증 없는 publishable key로 구독·발행한다.
- 이벤트는 **행동한 클라이언트가 Server Action 성공 응답을 받은 뒤 직접 `channel.send()`**
  한다(`sendRoomEvent`). 서버가 대신 브로드캐스트하지 않는다.
- 수신 측은 `onRoomEvent`로 이벤트를 받아도 그 payload를 상태에 바로 반영하지 않는다. 이벤트는
  "지금 다시 읽어라"는 힌트 + 토스트 표시용일 뿐이고, 실제 상태 갱신은 항상 `refreshRoom()`
  Server Action을 다시 호출해 얻은 스냅샷으로 한다(`use-room-sync.ts`의 `debouncedRefetch`).
  그래서 이벤트가 유실되거나 위조돼도(공개 채널이라 이론상 가능) 최종 상태는 스냅샷이 정정한다.

**refetch 트리거**(`use-room-sync.ts`). 이벤트별 처리 정책은
`src/lib/realtime/event-sync-policy.ts`가 소유하고, 상세는 `03-realtime-protocol.md`가 정본이다:

| 트리거         | 조건                                                        |
| -------------- | ----------------------------------------------------------- |
| 이벤트 수신    | 정책에 따라 즉시(`round.*`) / 넘김 / 합침 — 250ms 디바운스  |
| Presence sync  | 모르는 참가자 id가 나타날 때만 refetch                      |
| 구독 성공 직후 | `channel.subscribe` 콜백에서 즉시 refetch(재연결 공백 복원) |
| 폴링           | 탭이 visible일 때 20초 간격 `setInterval`                   |
| 가시성·연결 복귀 | `visibilitychange`/`online`/`pageshow`에서 즉시 refetch    |

payload 검증은 `events.ts`의 `parseEvent()` — envelope(`v`/`id`/`roomId`/`actorId`/`at`) +
이벤트별 zod 스키마를 한 번에 검증하고, 실패하면 조용히 버린다(상태 미반영, 스냅샷 경로로 복구).

과거 마이그레이션에 있던 `realtime.messages` RLS 정책은 현 baseline(`0007`)에서 제거됐다.
현재 공개 채널에는 적용되는 Realtime RLS 정책이 없다. private 채널 전환은 새 정책과 Supabase JWT
브리지를 함께 설계해야 한다.

### 쓰기 경로

```
1. 사용자 탭
2. Server Action 호출 — 권한 검사, 도메인 엔진 판정, DB 커밋 (칩 관련은 방 단위
   pg_advisory_xact_lock 으로 동시 갱신 직렬화)
3. 성공 응답을 받은 클라이언트가 sendRoomEvent() 로 방에 브로드캐스트
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
`poker`(52장 카드 모델·족보 엔진), `game`(방·세션·라운드, room-code 발급, 컴포넌트 다수),
`betting`(베팅 액션·규칙), `fairness`(commit-reveal 시드·영수증·덱 재계산), `budget`(예산),
`wallet`(계정 귀속 가상 크레딧), `ranking`(랭킹 조회), `promotions`(공지 배너·팝업),
`jokbo-advisor`(vision + 수동 피커), `auth`(세션·역할·관리자).

파일이 400줄을 넘으면 책임 단위로 쪼개고 `actions.ts`/`queries.ts`를 배럴로 남긴다
(`game/queries.ts`, `ranking/queries.ts`, `fairness/receipt.ts`가 그런 배럴이다). 그래서 문서에
적힌 `<domain>/queries.ts` 같은 경로는 진입점이고, 구현은 그 옆 모듈에 있을 수 있다.

규칙:

- `features/hwatu`는 다른 feature를 import하지 않는다.
- `features/seotda`, `features/gostop`, `features/poker`는 카드 모델만 의존한다. 서로 의존 금지.
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
| 실시간        | Supabase Realtime Broadcast(공개 채널) + Presence  | 전용 서버 불필요, 저지연. 인증 연동은 안 함 — obscurity + 스냅샷 재검증으로 대체           |
| DB 접근       | Drizzle ORM + postgres-js, 전용 롤(bypassrls)      | 스키마를 타입 소스로. service role key/JWT 브리지 없이 커넥션 문자열 하나로 통제           |
| 인증          | Auth.js v5, Authentik 선택적 + 게스트 로그인       | Authentik 미등록 상태에서도 개발·현장 운영 가능                                            |
| 검증          | zod                                                | realtime payload·env·폼 입력 단일 검증 수단                                                |
| 배포          | Docker, `kanduit-lab/docker-deploy-control-hub` v2 | 사용자 소유 self-hosted 인프라. Vercel 미사용                                              |
| Vision        | Anthropic Claude 또는 Gemini(`vision_settings`)    | API key는 환경변수에만 두고, 관리자 콘솔에서 공급자·모델·활성화와 키의 준비 상태를 관리 |

## Alternatives Considered

### A. 자체 Node + Socket.IO 서버

- 기각 사유: docker 인프라로도 stateful WebSocket 서버를 별도로 유지하는 비용이 Supabase
  Realtime 재사용보다 크다. 규칙 판정은 이미 Server Action에 있어 실익이 없다.

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

- 스키마 소유: `02-data-model.md` (drizzle `drizzle/schema.ts`가 source of truth, SQL은
  `drizzle/migrations/` + `supabase/migrations/`).
- RLS는 `anon`/`authenticated` 대상 방어층. 실질적 권한 판정은 Server Action.
- `kkeutbal_app`은 RLS를 우회하지만 DML과 시퀀스 사용 권한만 가진다. 정책·권한 기준은
  `0007_database_hardening.sql`이다.
- 외부 공개 REST API는 없다. 클라이언트 진입점은 Server Actions와 Realtime 공개 채널뿐이다.

## Migration And Rollout

1. [`08-database-migrations.md`](08-database-migrations.md) 순서로 `pnpm db:migrate`와
   Supabase 보안 SQL을 적용한다. `db:push`는 운영 반영 경로로 사용하지 않는다.
2. `supabase/migrations/0007_database_hardening.sql`은 새 DB의 현재 RLS baseline이고,
   `0008_rate_limit_buckets_rls.sql`은 기존 DB에 신규 내부 테이블 권한을 보강한다.
3. Authentik 애플리케이션에 `{APP_URL}/api/auth/callback/authentik`을 Redirect URI로 등록하고,
   초기 관리자 계정으로 `/admin`의 SSO 설정을 저장·활성화.
4. **자동 배포 경로가 없다.** `docker-deploy-control-hub` 기반 워크플로(`.github/workflows/deploy.yml`,
   `.deploy.yml`)는 푸시마다 0초에 실패해 한 번도 배포한 적이 없어서 2026-08-09에 제거했다.
   지금 남은 것은 패키징 방법(`dockerfiles/Dockerfile.nextjs`, `output: 'standalone'`)과
   health check(`/api/health`)뿐이다 — 이미지를 만들어 올리는 일은 수동이다.
   도메인은 `kkeutbal.kanduit.app`을 쓸 예정이다.
5. 실제 MT 전에 2대 이상 기기로 리허설 1회 — 동기화·재접속·정산 확인.

롤백: 이전 docker 이미지 태그로 재배포(수동). 스키마는
초기 단계이므로 파괴적 변경 시 `drizzle-kit generate`로 down 경로를 명시적으로 만든다.

## Verification Plan

| 대상             | 방법                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------- |
| 게임 엔진 정확성 | Vitest 단위 테스트(`*.test.ts`). 섯다는 20장 조합 대조                                    |
| 칩 보존 불변식   | `chip_ledger` 기반 잔액 = delta 합. 세션 정산 시 순손익 합계 0 검증                       |
| 실시간 지연      | 2개 브라우저 컨텍스트에서 액션→반영 타임스탬프 측정(Playwright) — 현재 자동화 스위트 없음 |
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
| DB 인증서 미검증                                                           | 중간자 서버에 DB 자격 증명·쿼리가 노출될 수 있음 | `DATABASE_CA_CERT_BASE64`로 TLS 체인·호스트 검증                                                          |
| MT 현장 Wi-Fi/LTE 불안정                                                   | 액션 유실·중복                                   | 멱등키(betting), 폴링+visibilitychange 재동기화, 서버 스냅샷 우선                                         |
| Broadcast 메시지 유실(전달 보장 없음)                                      | 화면 불일치                                      | 이벤트를 힌트로만 쓰고 20초 폴링 + 250ms 디바운스 refetch로 항상 정정                                     |
| Vision 오인식으로 잘못된 족보 안내                                         | 판 분쟁                                          | 인식은 보조. 수동 피커 폴백, 결과 수정 UI 필수                                                            |

## Open Questions

- [ ] 공개 Broadcast + 스냅샷 재검증을 유지할지, private 채널(Supabase JWT 브리지와 새 RLS 정책 포함)로
      전환할지 결정.
- [ ] `preview`/`staging` 배포(`enabled: false`)를 켤 시점과 `ENV_FILE_BASE64` 시크릿 구성 주체.
- [ ] Authentik 실등록 일정 — 그 전에도 내부 계정과 게스트 토큰 로그인은 사용 가능.
