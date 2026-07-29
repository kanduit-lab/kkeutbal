# 12. 인수인계 — 가입 코드 크래시 + RSC 함수 prop 버그 수정

**상태**: 로컬 브랜치 `develop`에 커밋 완료(`e9ffc23`), **원격 push 실패** (권한 403, `kanduit-lab/kkeutbal`에 write 권한 없는 계정). 다른 사람이 push까지 이어받아야 함.

## 배경

사용자가 회원가입 화면에서 가입 코드를 입력하면 "문제가 생겼어요, 잠시 후 다시 시도해 보세요" (Next.js 에러 바운더리 기본 문구)로 리다이렉트되는 문제를 신고함. 조사 결과 이 문구는 정상 처리된 "가입코드가 일치하지 않습니다"류 메시지가 아니라, **처리되지 않은 예외가 에러 바운더리까지 뚫고 올라간 것**이었음.

## 원인 1 — unguarded `serverEnv()` / `consumeRateLimits()` 호출

- `src/features/auth/actions.ts`의 `verifyRegistrationCode`가 `consumeRateLimits(...)`를 try/catch 없이 호출 — DB 오류(연결 실패, env 미설정 등)가 나면 그대로 위로 전파되어 `src/app/error.tsx` 크래시 페이지로 감.
- `src/features/auth/registration-access.ts`의 `grantRegistrationAccess`, `registrationAccessCodeId` 두 곳 모두 `serverEnv()` 호출이 try 블록 **밖**에 있었음. `serverEnv()`는 `DATABASE_URL`, `DATABASE_CA_CERT_BASE64`, `AUTH_SECRET` 등 필수 env var가 하나라도 없으면 즉시 throw (`src/lib/env.ts`) — 이게 밖에서 나면 똑같이 크래시 페이지로 감.

### 수정

세 지점 모두 try/catch로 감싸서, 예외 발생 시 `{ status: 'error', error: 'unavailable' }` (또는 기존 캐치 로직)으로 폴백하도록 순서를 바꿈. 이제 DB/env 문제가 있어도 사용자는 "현재 회원가입을 받을 수 없습니다" 같은 정상 메시지를 보게 됨. **단, 이건 사용자 경험만 고치는 것 — 근본 원인(왜 DB/env 예외가 났는지)은 별도로 배포 환경 점검 필요.**

### 의심되는 근본 원인 (미확인)

로컬에서 `.env`를 재구성하다가, 기존에 실사용 중이던 `.env`가 **구버전 스키마**(`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `DATABASE_CA_CERT_BASE64` 필드 자체가 없음, `AUTH_DEV_LOGIN`/`AUTH_AUTHENTIK_*` 등 지금은 안 쓰는 필드들 포함)였다는 걸 발견함. 현재 `src/lib/env.ts`의 `serverSchema`는 `DATABASE_CA_CERT_BASE64`를 필수로 요구함.

**배포 서버(`kkeutbal.kanduit.app`)의 실제 env도 이 구버전 스키마로 남아있을 가능성이 있음.** 만약 그렇다면 `DATABASE_CA_CERT_BASE64` 부재로 `serverEnv()`가 항상 throw하고 있었을 것이고, 이게 이번 크래시의 진짜 트리거였을 가능성이 높음. **다음 사람이 확인해야 할 것**:

1. 배포 환경(GitHub Actions secrets 또는 서버의 `.env`)에 `DATABASE_CA_CERT_BASE64`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`가 실제로 설정되어 있는지 확인
2. 없다면 Supabase 대시보드 → Project Settings → Database → SSL Configuration에서 CA 인증서 받아 `base64 -i <cert> | tr -d '\n'`로 인코딩 후 배포 시크릿에 추가
3. `NEXT_PUBLIC_SUPABASE_ANON_KEY`류 구필드가 배포 시크릿에 남아있다면 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`로 이름 정정 필요 (`mcp__supabase__get_publishable_keys`로 값 조회 가능)

## 원인 2 — RSC 함수 prop 직렬화 에러 (별개 버그, 로컬에서 새로 발견)

가입 코드 통과 후 `/register` 폼 자체를 렌더링하는 단계에서 별도 런타임 에러 발생:

```
Functions are not valid as a child of Client Components.
  <... label="아이디" required={true} error=... children={function children}>
```

### 원인

`src/app/register/page.tsx`는 서버 컴포넌트인데, `src/components/ui/input.tsx`의 `Field`(클라이언트 컴포넌트)에 `children`으로 화살표 함수 `(control) => <Input .../>`를 직접 넘기고 있었음. RSC는 서버→클라이언트 경계로 함수를 직렬화할 수 없어서 크래시.

같은 저장소의 `src/app/login/page.tsx`는 이 문제가 없었는데, 이유는 폼 로직 전체를 `LoginFormSwitcher`(client 컴포넌트, `useDict()` 훅으로 딕셔너리 접근)로 위임하고 있었기 때문. `RegisterPage`만 유일하게 이 render-prop 패턴을 서버 컴포넌트에서 직접 쓰고 있었음.

### 수정

- `src/features/auth/components/register-form.tsx` 신규 생성 (client 컴포넌트) — 기존 `RegisterPage`에 있던 폼 렌더링, 에러 메시지 매핑, `Field` 사용부를 통째로 이전. `LoginFormSwitcher`와 동일한 패턴(`useDict()`로 딕셔너리 접근).
- `src/app/register/page.tsx`는 `searchParams` 파싱과 `hasRegistrationAccess()`/`isFirstAccount()` 리다이렉트 로직만 남기고, 폼은 `<RegisterForm />`에 props로 위임.

## 검증 상태

- `pnpm typecheck` 통과 (Node 24.18.0 + pnpm 11.15.1 로컬 환경에서 확인 — 아래 "로컬 개발 환경 이슈" 참고)
- 로컬 dev 서버(`pnpm dev`)에서 `/register` → 가입 코드 입력 → 회원가입 폼까지 정상 동작 확인 (테스트용 가입 코드를 Supabase에 직접 insert해서 재현: `registration_codes` 테이블, HMAC-SHA256(`AUTH_SECRET`) 해시로 저장됨 — 평문은 저장 안 되므로 기존 코드 조회 불가, 필요하면 새로 발급해야 함)
- **`pnpm build` 미실행** — CLAUDE.md 컨벤션상 build는 사용자가 직접 실행

## 커밋 정보

```
브랜치: develop
커밋: e9ffc23 fix: prevent auth crash-boundary fallthrough and RSC function-prop error
변경 파일:
  M src/app/register/page.tsx
  M src/features/auth/actions.ts
  A src/features/auth/components/register-form.tsx
  M src/features/auth/registration-access.ts
```

**push 실패 원인**: `git push` 시 `remote: Permission to kanduit-lab/kkeutbal.git denied to Jaeooo` (403). `gh auth status`로는 `Jaeooo` 계정이 정상 로그인·`repo` 스코프 보유 확인됨 — 즉 토큰 문제가 아니라 조직 리포지토리에 대한 컬래버레이터/팀 write 권한이 없는 것으로 보임. 이어받는 사람은:

1. write 권한 있는 계정으로 `git push` 재시도, 또는
2. 조직 관리자에게 `Jaeooo` 계정 write 권한 요청, 또는
3. 포크 후 PR 방식으로 전환

## 로컬 개발 환경 이슈 (참고용, 이미 해결됨)

이번 작업 중 로컬 환경에 다음 문제가 있었고 해결함 — 다른 머신에서도 겪을 수 있어 기록:

- 전역 `pnpm` 바이너리가 corepack shim으로 깨져 있었음 (`ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`). `~/.nvm/versions/node/<ver>/bin/pnpm` 삭제 후 `npm install -g pnpm@11.15.1`로 재설치하면 해결.
- `package.json`의 `pnpm@11.15.1`은 Node ≥22.13 요구. 이 저장소의 `.nvmrc`는 이미 `22`로 고정되어 있음 — `nvm use` (또는 v24 계열)로 맞추면 됨.
