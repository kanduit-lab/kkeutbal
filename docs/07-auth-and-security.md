# 인증 · 권한 · 보안

| Field | Value |
|-------|-------|
| Type | technical-design |
| Audience | engineering / operators / reviewers |
| Status | draft |
| Source of truth | this document (인증 흐름·역할 권한·보안 경계) |
| Last reviewed | 2026-07-22 |

## Context

전체 로그인이 전제다. 운영자가 **Authentik**을 이미 운영 중이므로 신원을 그쪽으로 일원화한다.
동시에 데이터 격리는 애플리케이션이 아니라 **DB(RLS)**에서 강제한다.

## 인증 흐름

```
브라우저 ──► Next.js (Auth.js v5)
                 │  OIDC Authorization Code + PKCE
                 ▼
            Authentik  (사용자 자체 운영 IdP)
                 │  id_token (sub, name, email, picture)
                 ▼
         Auth.js 세션 쿠키 (httpOnly, secure, sameSite=lax)
                 │
                 ├─► users 테이블 upsert (authentik_sub 기준)
                 └─► Supabase 접근용 단명 JWT 발급 → Realtime/RLS
```

### Auth.js 설정 요지

```ts
// src/lib/auth.ts
import NextAuth from 'next-auth'
import Authentik from 'next-auth/providers/authentik'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Authentik],   // AUTH_AUTHENTIK_ID / _SECRET / _ISSUER 자동 인식
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 3 },
  callbacks: { /* sub → users.id 매핑, 세션에 userId 주입 */ },
})
```

환경변수는 `AUTH_` 접두사 규약을 따르므로 provider에 값을 직접 넣지 않는다 (`.env.example` 참조).
`AUTH_AUTHENTIK_ISSUER`는 Authentik 애플리케이션의 OIDC issuer URL이며 **끝 슬래시를 포함**한다.

세션 수명을 3일로 잡은 이유: MT 같은 1~3일 이벤트 도중 재로그인이 뜨면 최악의 UX다.
IdP가 잠시 불통이어도 진행 중인 판이 끊기지 않는다 (`01-architecture.md` 리스크 표).

### Authentik 쪽 설정

| 항목 | 값 |
|------|-----|
| Provider 종류 | OAuth2 / OpenID Provider |
| Client type | Confidential |
| Redirect URI | `{APP_URL}/api/auth/callback/authentik` |
| Scopes | `openid`, `profile`, `email` |
| Subject mode | 안정적인 `sub` (사용자 UUID) |

`sub`가 바뀌면 기존 전적과 연결이 끊긴다. Authentik에서 subject mode를 변경하지 말 것.

### 대체 경로 (Authentik 불가 환경)

Supabase Auth를 대신 쓸 수 있다. 이 경우 `users.authentik_sub` 대신 Supabase `auth.uid()`를
직접 쓰고 JWT 브리지 계층이 통째로 빠진다. 구성은 단순해지지만 사용자의 SSO 일원화가 깨진다.
초기 선택에서 기각한 이유는 `01-architecture.md` Alternatives D 참조.

## Supabase RLS 브리지

문제: RLS 정책은 `auth.uid()`를 본다. 그런데 신원의 소유자는 Authentik이고 세션은 Auth.js가 쥔다.

해결: 서버가 **단명 JWT를 발급**해 클라이언트에 내려주고, Supabase 클라이언트가 그 토큰으로
Realtime·PostgREST에 접속한다.

```
Server Action: 세션 검증 → users.id 확인
             → SUPABASE_JWT_SECRET 으로 { sub: users.id, role: 'authenticated', exp } 서명
             → 클라이언트에 전달 (수명 짧게, 만료 전 갱신)
```

- 토큰 수명은 짧게 두고 클라이언트가 만료 전에 재발급받는다.
- `SUPABASE_JWT_SECRET`은 **서버 전용**이다. 클라이언트 번들에 절대 포함되지 않아야 한다.
- 이 브리지가 실패하면 Realtime 구독이 거부된다 — 조용히 실패하지 않고 재인증을 유도한다.

> 미확정: Supabase의 third-party auth 설정으로 이 브리지를 대체할 수 있는지 검토 필요
> (`01-architecture.md` Open Questions).

## 역할 · 권한

방 단위 역할이다. 전역 관리자 역할은 두지 않는다.

| 권한 | host | dealer | player | observer |
|------|:----:|:------:|:------:|:--------:|
| 방 설정 변경 (룰·입력 모드) | ✅ | — | — | — |
| 역할 위임 | ✅ | — | — | — |
| 방 종료 · 정산 확정 | ✅ | — | — | — |
| 판 시작 / 종료 | ✅ | ✅ | — | — |
| 액션 승인 · 거절 | ✅ | ✅ | — | — |
| 액션 정정 (revert) | ✅ | ✅ | — | — |
| 대리 입력 | ✅ | ✅ | — | — |
| 본인 액션 제출 | ✅ | ✅ | ✅ | — |
| 바이인 추가 | ✅ | ✅ | ✅(본인) | — |
| 방 상태 조회 | ✅ | ✅ | ✅ | ✅ |
| 타인 손패 조회 (판 종료 전) | — | — | — | — |

- `host`는 방 생성자. 이탈 시 다른 참가자에게 위임할 수 있다.
- `dealer`는 여러 명일 수 있다. 인원이 많은 방에서 승인 병목을 줄인다.
- **타인 손패는 누구도 판 종료 전에 볼 수 없다.** host·dealer도 예외가 아니다.

권한 검사는 **UI 게이팅과 서버 검증 양쪽**에서 한다. UI에서 버튼을 숨기는 것은 편의이지 보안이
아니다. 모든 Server Action은 세션 → 역할 → 대상 방 소속을 다시 확인한다.

## 보안 경계

| 경계 | 규칙 |
|------|------|
| 클라이언트 입력 | 전부 불신. zod 검증 후에만 사용. `actorId`도 세션과 대조 |
| Realtime payload | 신뢰 경계 밖. 스키마 불일치 시 폐기 (`03-realtime-protocol.md`) |
| Vision 모델 출력 | 신뢰 경계 밖. 파싱 실패 시 부분 반영 금지 (`05-jokbo-advisor.md`) |
| 칩 원장 쓰기 | service role 서버 경로만. 클라이언트 INSERT 불가 |
| 비밀값 | `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `ANTHROPIC_API_KEY`, `AUTH_SECRET`은 서버 전용 |
| 데이터 격리 | 전 테이블 RLS. 앱 버그가 있어도 방 밖으로 안 샘 |

### 체크리스트 (커밋 전)

- [ ] 하드코딩된 비밀값 없음 (`.env.example`에 키 이름만)
- [ ] `NEXT_PUBLIC_` 접두사가 붙은 서버 전용 값 없음
- [ ] 모든 Server Action이 세션·역할·방 소속을 검증
- [ ] 모든 외부 입력(폼·realtime·vision)이 zod 통과
- [ ] 신규 테이블에 RLS 활성화 + 정책 존재
- [ ] 에러 메시지에 내부 식별자·스택 노출 없음
- [ ] Vision 업로드에 크기·MIME·호출 빈도 상한 적용

## 개인정보

- 저장하는 개인정보는 **표시 이름과 아바타 URL**뿐이다. 이메일은 저장하지 않는다
  (필요 없고, 저장하면 지켜야 할 것만 늘어난다).
- 게임 기록은 그룹 내에서만 조회된다.
- 사진 인식 업로드 이미지는 인식 후 보존하지 않는다. 오인식 추적에는 결과와 신뢰도만 남긴다.

## Verification

| 대상 | 방법 |
|------|------|
| RLS 격리 | 비참가자 JWT로 각 테이블 조회 → 0행 확인 |
| 원장 쓰기 차단 | anon 키로 `chip_ledger` INSERT 시도 → 거부 확인 |
| 역할 게이팅 | player 세션으로 승인·정정 Server Action 호출 → 거부 확인 |
| 손패 비공개 | 판 진행 중 타인 `hand_records` 조회 → 0행 확인 |
| 토큰 누출 | 클라이언트 번들 검색으로 서버 전용 키 부재 확인 |

## Open Questions

- [ ] Supabase JWT 브리지 vs third-party auth 설정 — 구현 착수 전 결론 필요.
- [ ] 방 코드만 알면 입장 가능한가, 아니면 host 승인이 필요한가. 기본값 결정 필요
      (현재 가정: 코드만으로 입장, host가 강퇴 가능).
