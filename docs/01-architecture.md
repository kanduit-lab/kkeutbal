# 아키텍처

| Field | Value |
|-------|-------|
| Type | technical-design |
| Audience | engineering / reviewers / operators |
| Status | draft |
| Source of truth | this document (스택·배포 토폴로지·모듈 경계) |
| Last reviewed | 2026-07-22 |

## Context

실물 화투판 옆에서 돌아가는 **실시간 다중 참가 기록 앱**이다. 제약:

- 운영자가 **전용 게임 서버를 두지 않는다.** 상시 켜둘 stateful 노드가 없다.
- 참가자는 전부 모바일 브라우저. 설치 없이 링크/QR로 들어온다.
- 사용자는 **Authentik**을 자체 운영 중이며, 전체 로그인을 전제로 한다.
- 동시 사용 규모는 방당 2~10명, 동시 방 수 한 자릿수. 부하가 아니라 **지연**이 품질을 좌우한다.

## Goals

- 액션 반영 지연 **p95 300ms 이내**.
- 서버 상시 운영 부담 0 — 서버리스 + 관리형 백엔드로 끝낸다.
- 게임 규칙 로직은 **순수 함수**로 격리해 단위 테스트 가능하게 한다.
- 방 데이터가 다른 방/다른 사용자에게 새지 않도록 DB 레벨에서 차단한다.

## Non-goals

- 수평 확장·리전 분산·고가용성 설계. 규모가 아니다.
- 자체 WebSocket 서버 운영.
- 오프라인 우선(offline-first) 완전 동기화. 재연결 복원까지만 한다.

## Current State

신규 프로젝트. 기존 시스템·마이그레이션 대상 없음. 저장소 초기 커밋 시점 기준으로
`src/` 는 도메인 타입·화투 카드 모델·엔진 스텁만 존재하며 런타임 구현은 미착수다.

## Proposed Design

### 배포 토폴로지

```
 ┌─────────────┐   OIDC    ┌──────────────┐
 │  브라우저   │◄─────────►│  Authentik   │  (사용자 자체 운영)
 │ (모바일 웹) │           └──────────────┘
 └──────┬──────┘
        │ HTTPS (SSR/RSC, Server Actions)
        ▼
 ┌──────────────────────┐
 │  Next.js 15 @ Vercel │  서버리스. 쓰기 검증·권한·엔진 실행
 └──────┬───────────────┘
        │ postgres-js / supabase-js (service role)
        ▼
 ┌──────────────────────────────────────────┐
 │  Supabase                                │
 │  ├ PostgreSQL  : 영속 상태 · RLS         │
 │  └ Realtime    : Broadcast · Presence    │
 └──────────────────────────────────────────┘
        ▲
        └──── WebSocket (브라우저 직결, anon key + JWT) ────┘
```

### 실시간 전략 — Broadcast 우선

Supabase Realtime은 세 가지 기능을 제공한다: **Broadcast**(pub/sub 메시지), **Presence**(접속자
상태), **Postgres Changes**(DB 변경 CDC 스트림).

끗발은 **라이브 액션에 Broadcast를 쓴다.** Postgres Changes를 쓰지 않는 이유:

| 항목 | Broadcast | Postgres Changes |
|------|-----------|------------------|
| 경로 | 클라이언트 → Realtime 서버 → 클라이언트 | DB 커밋 → WAL 복제 → 필터 → 클라이언트 |
| 지연 | DB를 거치지 않음. 수십 ms | 복제·필터 단계만큼 추가 |
| 부하 특성 | 메시지 수에 비례 | 테이블 변경량·RLS 필터 비용에 비례 |
| 권한 | 채널 구독 시 RLS 1회 검사 후 커넥션 동안 캐시 | 변경 행마다 구독자별 권한 평가 |

즉 "Supabase Realtime은 느리다"는 통념은 대부분 Postgres Changes 경로 이야기다.
Broadcast는 DB를 타지 않으므로 게임 액션 전파에 적합하다.

**역할 분담:**

- **Broadcast** — 베팅 액션, 라운드 진행, 딜러 승인, 타이머, 커서/타이핑 같은 휘발성 이벤트.
- **Presence** — 누가 방에 접속해 있는지, 연결 상태.
- **Postgres** — 확정 상태(칩 잔액, 판 결과, 랭킹). 재접속 시 여기서 전량 복원.

권한은 `realtime.messages` 테이블에 RLS 정책을 걸고 클라이언트가 `private: true`로 구독하게 해
"방 참가자만 그 방 채널을 구독·발행"을 DB 레벨에서 강제한다. 정책은 구독 시 1회 평가 후 커넥션
수명 동안 캐시되므로 메시지마다 DB를 치지 않는다. 상세 이벤트 스키마는 `03-realtime-protocol.md`.

### 쓰기 경로 — 낙관적 UI + 서버 확정

```
1. 사용자 탭
2. 로컬 상태 즉시 반영 (optimistic)
3. Broadcast 로 방에 액션 전파  ← 화면 동기화는 여기서 끝
4. Server Action 으로 서버 검증 + Postgres 커밋 (권한·불변식·엔진 판정)
5. 서버가 확정 이벤트를 Broadcast 로 되쏨 → 클라이언트 상태를 서버 값으로 정합
```

3번이 체감 속도를, 4~5번이 정확성을 담당한다. 불일치가 생기면 **항상 서버 값이 이긴다.**
멱등키(`action_id` UUID)를 클라이언트가 생성해 중복 전송·재연결 재전송을 흡수한다.

### 모듈 경계

```
src/features/<domain>/       도메인별 폴더가 경계
  ├ types.ts                 도메인 타입 (외부 의존 없음)
  ├ <engine>.ts              순수 함수. I/O 금지
  ├ *.test.ts                엔진 단위 테스트
  ├ actions.ts               Server Actions (권한 검사 + 영속화)
  └ components/              해당 도메인 전용 UI
```

규칙:

- `features/hwatu` 는 최하위 공용 모듈. 다른 feature 를 import 하지 않는다.
- `features/seotda`, `features/gostop` 은 `hwatu` 만 의존한다. 서로 의존 금지.
- 엔진(순수 함수)은 `lib/`, `app/`, DB, fetch 를 import 하지 않는다. 테스트 가능성이 이 규칙의 이유다.
- DB 접근은 `lib/db` 와 각 도메인 `actions.ts` 에서만 한다. 컴포넌트에서 직접 쿼리 금지.

### 기술 선택 요약

| 레이어 | 선택 | 근거 |
|--------|------|------|
| 앱 프레임워크 | Next.js 15 App Router | SSR로 초기 방 상태를 즉시 그림. Server Actions로 별도 API 계층 생략 |
| 언어 | TypeScript strict + `noUncheckedIndexedAccess` | 카드 배열 인덱싱이 많아 undefined 누락이 실제 버그 원인이 됨 |
| 실시간 | Supabase Realtime Broadcast/Presence | 전용 서버 불필요, 저지연, RLS 연동 |
| DB 접근 | Drizzle ORM + postgres-js | 스키마를 타입 소스로. 마이그레이션 추적 가능 |
| 인증 | Auth.js v5 + Authentik OIDC | 사용자 기존 IdP 재사용, SSO 일원화 |
| 검증 | zod | realtime payload·env·폼 입력 단일 검증 수단 |
| 스타일 | Tailwind CSS v4 | 모바일 우선 레이아웃 반복 작업 축소 |
| 테스트 | Vitest(단위) + Playwright(E2E) | 엔진은 단위, 다중 기기 동기화는 E2E |
| Vision | Anthropic Claude `claude-sonnet-5` | 화투 패 인식을 별도 모델 학습 없이 처리 |

## Alternatives Considered

### A. 자체 Node + Socket.IO 서버

- 장점: 프로토콜 완전 제어, 서버 권위 상태머신을 한곳에 둘 수 있음, 벤더 종속 없음.
- 단점: **상시 켜둔 stateful 호스트가 필요**(Railway/Fly/Render). Vercel 단독 배포 불가.
  운영·모니터링·재기동 부담이 이 프로젝트 규모에 비해 과하다.
- 기각 사유: "전용 서버 없음"이 하드 제약.

### B. Next.js 단독 + SSE / 폴링

- 장점: 의존성 최소, 인프라 추가 0.
- 단점: 양방향이 아니라 액션 업로드는 별도 HTTP. 폴링은 지연·비용이 같이 오른다.
  Presence(누가 접속 중)를 직접 구현해야 한다.
- 기각 사유: 베팅 UX의 체감 속도 목표(300ms)를 안정적으로 못 맞춘다.

### C. Supabase Postgres Changes 로 전체 동기화

- 장점: 상태가 DB 하나로 수렴, 클라이언트 로직 단순.
- 단점: 모든 액션이 DB 왕복 + WAL 복제를 타서 지연이 붙고, 변경 행마다 구독자별 권한 평가 비용.
- 기각 사유: 지연. 단 **재접속 복원·랭킹 갱신** 같은 비휘발성 경로에는 부분 채택.

### D. 인증을 Supabase Auth 로 통일

- 장점: RLS와 JWT가 기본 연동돼 구성이 가장 단순.
- 단점: 사용자가 운영 중인 Authentik과 신원이 이원화된다. 범용 OIDC 연동은 1급 지원이 아니다.
- 기각 사유: SSO 일원화 우선. 단 **Authentik을 못 쓰는 환경의 대체 경로**로 문서에 남긴다
  (`07-auth-and-security.md`).

## Data / API / Permission Changes

- 신규 스키마 전체를 생성한다. 테이블·인덱스·관계는 `02-data-model.md`가 소유한다.
- RLS는 "방 참가자만 그 방 데이터 접근" 원칙으로 전 테이블에 적용한다.
- `realtime.messages` RLS로 채널 구독·발행 권한을 제어한다.
- 외부 공개 REST API는 만들지 않는다. 클라이언트 진입점은 Server Actions와 Realtime 채널뿐이다.

## Migration And Rollout

초기 구축이라 데이터 마이그레이션이 없다. 롤아웃 순서:

1. `drizzle-kit push` 로 테이블 생성 (`pnpm db:push`).
2. `supabase/migrations/0001_init.sql` 적용 — RLS 정책, realtime 발행 설정.
3. Authentik에 OIDC 애플리케이션 등록 후 redirect URI 등록.
4. Vercel 환경변수 주입 후 프리뷰 배포.
5. 실제 MT 전에 **2대 이상 기기로 리허설 1회** — 동기화·재접속·정산 확인.

롤백: 앱은 Vercel 이전 배포로 즉시 되돌린다. 스키마는 초기 단계이므로 파괴적 변경 시
`drizzle-kit generate` 로 down 경로를 명시적으로 만든다.

## Verification Plan

| 대상 | 방법 |
|------|------|
| 게임 엔진 정확성 | Vitest 단위 테스트. 섯다는 20장 조합 전수 대조 |
| 칩 보존 불변식 | 세션 정산 시 순손익 합계 0 검증 (단위 + E2E) |
| 실시간 지연 | 2개 브라우저 컨텍스트에서 액션→반영 타임스탬프 측정 (Playwright) |
| 재접속 복원 | 소켓 강제 종료 후 상태 일치 비교 (E2E) |
| 권한 격리 | 비참가자 토큰으로 방 데이터 조회 시도 → 0행 확인 |
| 타입·린트 | `pnpm typecheck`, `pnpm lint` |

## Risks And Mitigations

| 리스크 | 영향 | 완화 |
|--------|------|------|
| MT 현장 Wi-Fi/LTE 불안정 | 액션 유실·중복 | 멱등키 + 로컬 큐 재전송, 서버 값 우선 정합 |
| Broadcast 메시지 유실(전달 보장 없음) | 화면 불일치 | 주기적 상태 스냅샷 브로드캐스트 + 재접속 시 Postgres 전량 복원 |
| Supabase 무료 티어 동시 연결/메시지 한도 | 접속 실패 | 사용량 사전 확인, 방 인원 상한(10) 적용 |
| Authentik 다운 시 로그인 불가 | 앱 진입 불가 | 세션 수명을 이벤트 길이 이상으로 설정, 대체 인증 경로 문서화 |
| Vision 오인식으로 잘못된 족보 안내 | 판 분쟁 | 인식은 보조. 결과 수정 필수 UI, 신뢰도 표기 |
| 서버리스 콜드스타트 | 첫 액션 지연 | 화면 동기화는 Broadcast로 선행. 콜드스타트는 확정 경로에만 영향 |

## Open Questions

- [ ] Auth.js 세션을 Supabase RLS용 JWT로 브리지하는 방식 확정 필요 — 서버에서 단명 JWT 발급 vs
      Supabase third-party auth 설정. `07-auth-and-security.md`에서 결론 내고 여기에 링크.
- [ ] Broadcast 메시지 보존(`realtime.messages` 적재) 사용 여부 — 감사 로그를 Postgres 별도
      테이블로 이중화할지 결정.
