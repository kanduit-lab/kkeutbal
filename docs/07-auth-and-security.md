# 인증 · 권한 · 보안

| Field           | Value                                                                   |
| --------------- | ----------------------------------------------------------------------- |
| Type            | technical-design                                                        |
| Audience        | engineering / operators / reviewers                                     |
| Status          | active                                                                  |
| Source of truth | 구현은 auth·권한 코드와 스키마, 이 문서는 인증 흐름·역할 권한·보안 경계 |
| Last reviewed   | 2026-07-28                                                              |

## Context

전체 로그인이 전제다. 1차 신원은 **내부 계정**(아이디·비밀번호·이름·전화번호)이고, 운영자가
Authentik을 운영 중이면 SSO 로그인 시 아이디 또는 전화번호가 일치하는 내부 계정으로 자동
연동(병합)한다. 인가는 DB 레벨 RLS가 아니라 **Server Action이 매 호출마다 재검사**하는 방식으로
강제한다 — 이유는 아래 "DB 접근 경로" 참조.

## 인증 흐름 (2026-07-25 개편)

3개 로그인 경로가 조건부로 공존한다. `src/lib/auth.ts`가 런타임에 provider 배열을 구성한다.

```
password (항상 활성)
  → 내부 계정. 회원가입은 features/auth/actions.ts registerAndLogin
  → users.username + bcrypt(password_hash). sub = `local:{username}`

관리자 콘솔의 SSO 설정에서 활성화 + Issuer URL + Client ID + Client secret 모두 저장
  → Authentik OIDC provider 활성 (hasAuthentik())
  → 자동 연동: sub 일치 행이 없으면 preferred_username/phone_number 클레임으로
    내부 계정을 찾아 authentik_sub 를 교체해 병합 (resolveProviderUser)

guest-token (항상 활성)
  → 관리자가 발급한 8자 토큰 + 이름 → sub = `guest:{tokenId}:{name}`
  → 같은 (토큰, 이름) = 같은 계정. 토큰은 만료·회수 가능
  → 신규 토큰은 `guest_tokens.code_hash` HMAC만 저장, 레거시 원문은 관리자 콘솔 최초 진입 시 일괄 해시 전환

```

로그인 화면은 활성 provider만 노출한다. 관리자(`users.is_admin`)는 `/admin`에서 게스트 토큰
발급·회수, 관리자 지정, SSO 설정을 한다
(`features/auth/admin-actions.ts`, 게이트는 `features/auth/roles.ts` `isAdminUser`).

### 로그인 경로가 없는 사용자 행 — 로컬 플레이어

방 호스트·딜러가 로비에서 이름만으로 만드는 대리 기록용 좌석(`users.is_managed`,
sub = `managed:{roomId}:{uuid}`). provider가 아니며 위 세 경로 중 어느 것으로도 로그인되지 않는다.

- 비밀번호: `password_hash`가 null이라 `authorize`가 거부한다.
- 게스트: sub가 발급된 `guest_tokens` 행에서만 파생돼 네임스페이스가 겹치지 않는다.
- SSO: `resolveProviderUser`의 sub 조회와 username/phone 병합 조회 모두
  `is_managed = false` 조건을 건다 (`lib/auth.ts`).

세션·정산은 일반 참가자와 같고 전역 누적 랭킹에서만 제외된다.
[`02-data-model.md`](02-data-model.md) `users` 절 참조.

```
브라우저 ──► Next.js (Auth.js v5)
                 │
                 ▼
          password / Authentik / guest-token
                 │
                 ▼
         jwt 콜백 (src/lib/auth.ts)
                 │  최초 로그인(user && account 존재)에만 실행
                 ▼
      public.users upsert (authentik_sub 기준 onConflict)
                 │
                 ▼
         Auth.js 세션 쿠키 (JWT, maxAge 3일)
                 │  token.uid = users.id
                 ▼
         session.user.id 로 노출 (authConfigBase.callbacks.session)
```

증거: `src/lib/auth.ts`, `src/lib/auth-config.ts`.

### 최초 관리자 설정 가드

계정이 없는 새 인스턴스는 로그인 페이지를 처음 열 때 16자리 랜덤 설정 코드를 만든다. 원문은
서버 콘솔에만 출력하고, DB에는 `AUTH_SECRET` 기반 AES-GCM 암호문과 만료 시각만
`auth_settings`에 저장한다. 로그인 카드에서 코드가 확인되면 현재 암호문의 식별자와 만료 시각을
서명한 10분짜리 HTTP-only·SameSite=Strict 쿠키를 `/register` 경로에 발급한다.

코드와 쿠키는 모두 10분 뒤 만료된다. 만료 뒤 초기 관리자 화면을 다시 열거나 코드 확인을
시도하면 새 코드가 생성되어 서버 콘솔에 재출력되고, 이전 코드와 쿠키는 무효가 된다. 실제 첫
사용자 삽입 트랜잭션은 advisory lock을 잡은 뒤 사용자 부재·코드 식별자·만료 시각을 다시
검사한다. 성공하면 같은 트랜잭션에서 설정 코드 암호문과 만료 시각을 지운다. 따라서 URL 직접
접근, 폼 직접 제출, 동시에 검증된 두 브라우저의 중복 관리자 생성이 모두 차단된다.

구현 근거: `src/features/auth/initial-admin-setup.ts`,
`src/features/auth/bootstrap.ts`, `src/features/auth/actions.ts`.

### 회원가입 코드

관리자가 `/admin`에서 발급한 가입코드는 `registration_codes.code_hash`로만 저장된다. 로그인
카드의 가입코드 폼이 `verifyRegistrationCode` Server Action으로 코드를 전송하고, 활성·미만료·미회수
코드인지 확인한다. 일치하면 코드 id와 만료 시각을 `AUTH_SECRET`으로 서명한 10분짜리 HTTP-only
쿠키를 `/register` 경로에 발급한다. 페이지와 가입 액션은 코드가 아직 활성인지 DB에서 다시
확인하고 가입 성공 후 쿠키를 폐기하므로 URL 직접 접근이나 폼 직접 제출로는 가입할 수 없다.
원문 코드는 발급 직후에만 관리자에게 반환되고, 이후에는 회수·만료 상태만 관리한다. 첫 계정은
위의 최초 관리자 설정 가드를 통과해야 하며, 그 뒤의 내부 계정은 이 가입코드를 사용한다.
구현 근거:
`src/features/auth/registration-access.ts`, `registration-codes.ts`, `admin-actions.ts`.

### 설정 파일이 둘로 나뉜 이유

- `src/lib/auth-config.ts` — edge-safe. provider 없이 세션 옵션·`session` 콜백만 가진다.
  `src/proxy.ts`가 이 파일만 import한다.
- `src/lib/auth.ts` — 전체 설정. `db`(postgres 커넥션)를 물기 때문에 edge 런타임(미들웨어)에
  들어가면 안 된다. provider 목록 구성과 `jwt` 콜백(사용자 upsert)이 여기 있다.

이 분리를 깨고 미들웨어에서 `auth.ts`를 import하면 postgres 클라이언트가 edge 번들에 들어가
빌드가 깨지거나 커넥션이 예기치 않게 늘어난다.

### 세션 수명

`session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 3 }` — 3일. MT 같은 1~3일 이벤트 도중
재로그인 프롬프트가 뜨는 것을 막기 위한 값이다 (`01-architecture.md` 리스크 표).

### Authentik 쪽 설정

| 항목          | 값                                      |
| ------------- | --------------------------------------- |
| Provider 종류 | OAuth2 / OpenID Provider                |
| Client type   | Confidential                            |
| Redirect URI  | `{APP_URL}/api/auth/callback/authentik` |
| Subject mode  | 안정적인 `sub`                          |

`sub`가 바뀌면 `users.authentikSub` 매칭이 끊겨 기존 전적과 분리된 새 계정이 생긴다. Authentik에서
subject mode를 바꾸지 말 것. Issuer URL·Client ID·Client secret은 초기 관리자 로그인 후 `/admin`의
SSO 설정에 입력한다. client secret은 화면에 다시 표시하지 않으며 `AUTH_SECRET`으로 AES-GCM 암호화한
값만 `auth_settings`에 저장한다. `AUTH_SECRET`을 교체하면 기존 SSO secret을 복호화할 수 없으므로,
SSO 설정에서 새 secret을 다시 저장해야 한다.

## 미들웨어 — UX 게이트일 뿐

`src/proxy.ts`는 `authConfigBase`로 JWT 쿠키를 해독해 로그인 여부만 본다. 결과로 하는 일은
리다이렉트뿐이다:

- 미로그인 + 실제 인증 경로(`/`, `/rooms`, `/ranking`, `/advisor`, `/admin`, `/wallet`) → `/login`으로 리다이렉트 (`next` 쿼리로 원래 경로 보존)
- 로그인 + `/login` 접근 → `/`로 리다이렉트
- 그 밖의 경로는 프록시가 선점하지 않는다. 공개 문서는 그대로 보이고, 존재하지 않는 URL은 App Router 404가 처리한다.

**역할·방 소속 검사는 하지 않는다.** 여기를 통과했다고 해서 어떤 Server Action도 자동으로
허용되지 않는다 — 각 Server Action이 세션에서 `userId`를 다시 뽑고, DB에서 방 멤버십과 역할을
다시 조회한다. 미들웨어를 우회하는 직접 API 호출(curl 등)에도 동일한 방어가 걸리는 이유다.

## DB 접근 경로

**중요한 사실: 이 앱에는 Supabase JWT 브리지가 없다.** 예전 설계 초안(브라우저 세션을 Supabase
JWT로 서명해 내려주는 방식)은 구현되지 않았다. 실제 경로는 다음 두 갈래로 완전히 분리된다.

| 경로         | 클라이언트                                         | 인증 방식                                                                                           | 용도                 |
| ------------ | -------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------- |
| DB 읽기/쓰기 | `src/lib/db.ts` (drizzle + postgres-js, 서버 전용) | 전용 롤 `kkeutbal_app` (`bypassrls`), 5432 session / 6543 transaction pooler 자동 설정, CA 검증 TLS | 모든 테이블 CRUD     |
| Realtime     | `src/lib/supabase/client.ts` (브라우저)            | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, 로그인 세션과 무관                                          | Broadcast·Presence만 |

`kkeutbal_app`은 `bypassrls` 롤이므로 RLS 정책과 무관하게 모든 행에 접근한다. **인가는 RLS가
아니라 Server Action의 명시적 검사가 담당한다.** 패턴은 두 곳에 반복된다:

```ts
// src/features/game/actions.ts, src/features/betting/actions.ts 공통 패턴
async function requireRole(tx, roomId, userId, roles): Promise<boolean> {
  const [member] = await tx
    .select({ role: roomMembers.role })
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)))
    .limit(1)
  return member ? roles.includes(member.role) : false
}
```

방 단위 쓰기는 `pg_advisory_xact_lock(hashtextextended(roomId, 42))`로 트랜잭션 내 직렬화한
뒤 역할을 재확인한다 — 동시 요청으로 두 딜러가 같은 승인을 중복 처리하는 경쟁을 막는다.

### RLS는 방어층이지 인가 경로가 아니다

`supabase/migrations/0007_database_hardening.sql`은 현재 앱 테이블의 RLS를 켜고, `anon`·
`authenticated`의 테이블·시퀀스·함수 권한을 모두 회수한다. 이 정책은 다음 상황에서 방어한다:

- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`가 유출되어 누군가 PostgREST를 직접 두드리는 경우
- 향후 브라우저에서 Supabase 클라이언트로 직접 테이블을 조회하는 코드가 추가되는 경우

앱의 정상 동작 경로(Server Action → `kkeutbal_app`)는 RLS를 우회한다. 이 앱은 Supabase Auth를
쓰지 않으므로 브라우저에 PostgREST 권한을 열지 않는다. 브라우저에서 직접 테이블 조회를 추가하면
별도 Supabase JWT 브리지와 테이블별 정책을 함께 설계해야 한다.

### 칩 원장 불변성

`chip_ledger`는 `BEFORE UPDATE OR DELETE` 트리거(`chip_ledger_is_append_only`)로 수정 자체를
막는다. `kkeutbal_app`이 `bypassrls`라도 이 트리거는 우회하지 못한다 — 트리거는 RLS가 아니라
테이블 제약이다. 정정은 항상 `reverted_of`로 원본을 가리키는 반대 부호 새 행 INSERT로 한다
(`revertBet`, `voidRound` in `src/features/betting/actions.ts`, `src/features/game/actions.ts`).

## Realtime — 공개 채널, payload는 힌트일 뿐

`src/lib/realtime/client.ts`의 `createRoomChannel`은 `private: true`를 지정하지 않는다 —
**공개(public) Broadcast 채널**이며 publishable key로 접속한다. 토픽은 `room:{roomId}` (UUID).

과거 `0001_init_rls.sql`의 `realtime.messages` 정책은 `0007_database_hardening.sql`에서
제거한다. 앱이 Supabase Auth로 인증하지 않으므로 브라우저 클라이언트는 `authenticated`가 아니라
`anon` 롤로 붙고, 공개 채널은 애초에 `realtime.messages` RLS를 타지 않는다.

이 경계가 안전한 이유는 채널 자체의 인증이 아니라 **payload를 신뢰하지 않는 설계**에 있다
(`03-realtime-protocol.md`):

- 이벤트는 행동한 클라이언트가 Server Action 성공 뒤 직접 보낸다 — 서버가 검증한 결과의 사후
  통지일 뿐, payload 자체가 권위 있는 상태가 아니다.
- 수신자는 payload를 "다시 조회하라"는 힌트로만 쓰고, 실제 상태는 `refreshRoom` Server Action
  스냅샷 refetch로 확정한다 (250ms 디바운스 + 20초 폴링 + `visibilitychange`).
- 즉 토픽 UUID를 추측하거나 위조 payload를 보내도, 상태 변경은 여전히 `refreshRoom`이 다시
  검증한 결과로만 반영된다. 최악의 경우 화면에 잘못된 힌트가 잠깐 보였다가 다음 refetch에서
  정정된다 — 원장이나 역할이 실제로 바뀌지는 않는다.

이 설계를 바꾸려면(예: private 채널 + `authenticated` 롤 도입) `03-realtime-protocol.md`와
이 문서를 함께 갱신한다.

## 역할 · 권한

방 단위 역할은 `room_members.role`의 `host` / `dealer` / `player` / `observer`다. 별도로
`users.is_admin` 전역 관리자는 `/admin`에서 게스트 토큰·가입코드·SSO 설정·관리자 지정·공지를 관리하며,
방의 게임 권한을 자동으로 얻지는 않는다.

| 권한                                        | host | dealer | player |    observer     | Server Action                                                 |
| ------------------------------------------- | :--: | :----: | :----: | :-------------: | ------------------------------------------------------------- |
| 방 생성                                     |  ✅  |   —    |   —    |        —        | `createRoom`                                                  |
| 방 입장                                     |  ✅  |   ✅   |   ✅   |       ✅        | `joinRoom` (신규 참가자는 `player`로 배정)                    |
| 역할 변경 (host 자신 제외)                  |  ✅  |   —    |   —    |        —        | `setMemberRole`                                               |
| 방 정산 확정 (`closeRoom`)                  |  ✅  |   —    |   —    |        —        | `closeRoom`                                                   |
| 판 시작 (`startRound`)                      |  ✅  |   ✅   |   —    |        —        | `startRound`                                                  |
| 판 종료 (`endRound`)                        |  ✅  |   ✅   |   —    |        —        | `endRound`                                                    |
| 판 무효화 (`voidRound`)                     |  ✅  |   ✅   |   —    |        —        | `voidRound`                                                   |
| 베팅 승인 · 거절 (`approveBet`/`rejectBet`) |  ✅  |   ✅   |   —    |        —        | `betting/actions.ts`                                          |
| 확정 베팅 정정 (`revertBet`)                |  ✅  |   ✅   |   —    |        —        | `betting/actions.ts`                                          |
| 대리 입력 (타인 대신 `placeBet`)            |  ✅  |   ✅   |   —    |        —        | `placeBet` (`isProxy && isDealer`)                            |
| 본인 베팅 제출 (`placeBet`)                 |  ✅  |   ✅   |   ✅   |    — (거부)     | `placeBet` (`targetRole !== 'observer'`)                      |
| 타인 바이인 추가 (`addBuyIn`)               |  ✅  |   ✅   |   —    |        —        | `addBuyIn`                                                    |
| 본인 바이인 추가 (`addBuyIn`)               |  ✅  |   ✅   |   ✅   | — (명시적 거부) | `addBuyIn`                                                    |
| 방 스냅샷 조회 (`refreshRoom`)              |  ✅  |   ✅   |   ✅   |       ✅        | 로그인 사용자 전광판 조회 허용, 쓰기는 별도 검사              |
| 전역 운영 설정·공지 관리                    |  —   |   —    |   —    |        —        | `users.is_admin`을 별도 검사하는 관리자 액션 (방 역할과 무관) |

공통 규칙:

- `host`는 방 생성자이지만 위임할 수 있다 — `transferHost`(`member-actions.ts`)가 현재
  host 를 player 로 내리고 대상을 host 로 올린다. `setMemberRole`로는 `host` 역할 자체를
  바꿀 수 없다(`target.role === 'host'`이면 거부).
- `dealer`는 여러 명일 수 있다. 승인 요청 시 처리한 딜러가 먼저 락을 잡으면 나머지는
  "이미 처리된 액션입니다"로 실패한다(`approveBet`의 락 후 재조회).
- 손패 비공개 정책(타인 손패는 판 종료 전 조회 불가)은 `hand_records` 테이블 RLS 정책으로
  설계됐었으나, **`hand_records` 테이블 자체가 2026-07-23 제거됐다**(판독 결과를 저장하지
  않는 것이 확정 동작). 정책은 테이블 제거와 함께 소멸했고,
  `0001_init_rls.sql`의 정의는 적용 이력으로만 남는다.

권한 검사는 **UI 게이팅과 Server Action 양쪽**에서 한다. UI에서 버튼을 숨기는 것은 편의이지
보안이 아니다. 위 표의 모든 항목은 대응하는 Server Action이 세션 → 방 소속 → 역할 순으로
재확인한다(예시는 위 "DB 접근 경로"의 `requireRole` 패턴).

## 보안 경계

| 경계             | 규칙                                                                                                                                                                                                                                                                                             | 근거                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| 클라이언트 입력  | 전부 불신. zod 스키마 통과 후에만 사용                                                                                                                                                                                                                                                           | 모든 Server Action 상단 `parsed = schema.safeParse(input)`                                                                             |
| Realtime payload | 신뢰 경계 밖. 힌트로만 쓰고 진실은 `refreshRoom` refetch                                                                                                                                                                                                                                         | `03-realtime-protocol.md`, 위 "Realtime" 절                                                                                            |
| Vision 모델 출력 | 신뢰 경계 밖. zod 파싱 실패 시 부분 반영 없이 실패 반환                                                                                                                                                                                                                                          | `src/features/jokbo-advisor/vision/actions.ts`                                                                                         |
| 칩 원장 쓰기     | append-only 트리거로 UPDATE/DELETE 자체가 불가. 정정은 반대 부호 INSERT                                                                                                                                                                                                                          | `chip_ledger_is_append_only` 트리거                                                                                                    |
| 비밀값           | `DATABASE_URL`, `AUTH_SECRET`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`는 서버 환경변수다. SSO client secret과 10분짜리 최초 관리자 설정 코드만 `auth_settings`에 `AUTH_SECRET` 기반 암호문으로 저장하며, Vision API key는 DB에 저장하지 않는다. CA 인증서는 서버 전용 구성값이지만 secret은 아니다 | `src/lib/env.ts`, `features/auth/sso-settings.ts`, `features/auth/initial-admin-setup.ts`, `features/jokbo-advisor/vision/settings.ts` |
| DB 접근          | 서버(drizzle)만 `kkeutbal_app`으로 접속. 브라우저는 DB에 직접 붙지 않는다                                                                                                                                                                                                                        | `src/lib/db.ts`                                                                                                                        |
| 데이터 격리      | RLS는 전 테이블에 활성화되어 있으나 정상 경로에서 평가되지 않음(위 "RLS는 방어층" 절). 실질 격리는 Server Action의 방 소속 검사                                                                                                                                                                  | `requireRole` / `memberRole` 패턴                                                                                                      |

Vision 업로드는 크기 상한(5MB, `MAX_IMAGE_BYTES`)과 MIME 검증(jpeg/png/webp)이 있다.
Vision은 사용자당 분당 6회·시간당 30회로 제한한다. 비밀번호·게스트·회원가입·가입코드 경로도
`rate_limit_buckets`의 고정 창 카운터를 사용하며 식별자는 `AUTH_SECRET` HMAC으로만 저장한다
(`src/lib/rate-limit.ts`).

### 체크리스트 (커밋 전 / 배포 전)

- [ ] 하드코딩된 비밀값 없음 (`.env.example`에 키 이름만)
- [ ] `NEXT_PUBLIC_` 접두사가 붙은 서버 전용 값 없음
- [ ] `registration_codes`와 `auth_settings` 마이그레이션이 적용되어 있고, 서버 콘솔의 최초 관리자 설정 코드로 관리자 생성이 가능함
- [x] `0007_database_hardening.sql` 적용 및 `keep_alive` 제거, 내부 테이블 anon 권한 없음
- [ ] `DATABASE_CA_CERT_BASE64`가 Supabase CA와 일치함
- [ ] `vision_settings` 마이그레이션이 적용되어 있고, 활성 공급자의 환경변수 API key가 설정됨
- [ ] 모든 신규 Server Action이 세션·방 소속·역할을 재검증
- [ ] 모든 외부 입력(폼·realtime·vision)이 zod 통과
- [ ] 신규 테이블에 RLS 활성화(방어층 목적) — 단, 이 자체가 인가 경로가 아님을 인지
- [ ] 에러 메시지에 내부 식별자·스택 노출 없음

## 개인정보

- 저장하는 개인정보는 표시 이름, 전화번호, 내부 계정 아이디와 아바타 URL이다. 이메일은 저장하지
  않는다. 가입 실패 redirect에는 전화번호를 싣지 않는다.
- 사진 인식 업로드 이미지는 Server Action 호출 한 번 처리 후 보존하지 않는다. 인식 결과 자체도
  DB에 저장되지 않는다(위 참조) — 현재는 신뢰도 로그도 남지 않는다.

## Verification

| 대상               | 방법                                                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| 역할 게이팅        | player 세션으로 `startRound`/`approveBet`/`closeRoom` 등 host·dealer 전용 Server Action 호출 → `fail()` 반환 확인 |
| 대리 입력 제한     | player가 `placeBet`에 `targetUserId`를 다른 사용자로 지정 → 거부 확인                                             |
| observer 베팅 차단 | observer 역할로 `placeBet` 호출 → 거부 확인                                                                       |
| 원장 불변성        | `kkeutbal_app` 롤로 `chip_ledger` 직접 UPDATE 시도 → 트리거 예외 확인                                             |
| 직접 DB 접근 차단  | publishable key로 PostgREST 테이블 SELECT/INSERT → 권한 거부 확인                                                 |
| TLS 검증           | `DATABASE_CA_CERT_BASE64`가 없거나 잘못되면 DB 연결이 실패하는지 확인                                             |
| 가입코드 게이트    | 가입코드 없이 `/register` 접근·가입 폼 제출 → `/login`으로 이동, 올바른 코드 뒤에는 가입 가능                     |
| 토큰 누출          | 클라이언트 번들(`next build` 산출물)에서 `DATABASE_URL`, `AUTH_SECRET` 및 Vision API key 문자열 검색 → 부재 확인  |

## Open Questions

- [ ] realtime private 채널 정책 등 실제로 평가되지 않는 RLS 정책을 유지할지, 코드 경로를
      정책에 맞출지, 아니면 정리할지 결정 필요 (`hand_records` 정책은 2026-07-23 테이블
      제거로 해소됨).
- [ ] Authentik 실등록 시점과 절차 — 스코프 문서(`README.md`) 우선순위 참조.
