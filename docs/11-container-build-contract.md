# 11. 컨테이너 빌드 계약

`dockerfiles/Dockerfile.nextjs` 가 빌더에게 요구하는 것과 보장하는 것.

배포 경로가 둘로 늘어나면서(deploy hub, 그 외 빌더) 환경변수 공급 방식이 갈렸다.
이 문서는 그 경계를 고정한다.

## 배경

`next.config.ts` 는 `output: 'standalone'` 이다. `next build` 는 실행에 필요한 파일만
추린 자체 완결 서버를 `.next/standalone/server.js` 로 내놓고, 이걸 `node server.js` 로
띄운다. `next start` 는 이 모드와 호환되지 않는다 — Next 16 은 경고만 찍고 반쯤 동작하는
서버를 띄우므로, 붙긴 붙는데 Server Action 이 헤더 타임아웃으로 멈추는 형태로 실패한다.

`next build` 는 `.next/static` 과 `public` 을 standalone 안으로 복사해 주지 않는다.
Dockerfile 이 직접 옮긴다. 안 옮기면 HTML 은 뜨는데 자산이 전부 404 난다.

## 빌드 시점에 필요한 값

| 변수                                   | 필요 이유                  |
| -------------------------------------- | -------------------------- |
| `NEXT_PUBLIC_APP_URL`                  | 클라이언트 번들에 인라인됨 |
| `NEXT_PUBLIC_SUPABASE_URL`             | 〃                         |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 〃                         |

서버 전용 값(`DATABASE_URL`, `DATABASE_CA_CERT_BASE64`, `AUTH_SECRET`)은 **빌드에 넘기지
않는다.** 넘기면 이미지 레이어와 빌드 히스토리에 남는다. 이게 성립하려면 두 가지가 함께
필요하다:

1. Dockerfile 의 builder 스테이지가 `SKIP_ENV_VALIDATION=1` 을 세워 `serverEnv()` 검증을
   건너뛴다. runner 는 새 스테이지라 이 값을 이어받지 않으므로 런타임 검증은 살아 있다.
2. `src/lib/db.ts` 가 커넥션을 **첫 사용 시점에** 만든다. 최상위에서 만들면 모듈 import
   만으로 `Buffer.from(DATABASE_CA_CERT_BASE64, 'base64')` 가 실행되고, 검증을 꺼도
   `undefined` 를 받아 `TypeError` 로 빌드가 죽는다.

검증을 끄는 것만으로는 부족하다 — **모듈 최상위에 부수효과가 없어야** 빌드가 시크릿에서
자유로워진다. 새 모듈을 추가할 때 이 규칙을 깨지 말 것.

## 공급 경로 두 가지

**deploy hub** — `ENV_FILE_BASE64` 시크릿을 디코딩해 `.env.production.local` 로 컨텍스트에
떨군다. `COPY . .` 로 들어가고 Next 가 읽는다.

**그 외 빌더(Coolify 등)** — `--build-arg` 로 넘긴다.

```
docker build -f dockerfiles/Dockerfile.nextjs \
  --build-arg NEXT_PUBLIC_APP_URL=... \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=... \
  --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=... .
```

`@next/env` 는 `process.env` 에 이미 있는 키를 `.env` 파일 값으로 덮지 않고, 빈 문자열도
있는 키로 친다. 그래서 `ARG` 를 `ENV` 로 승격하지 않고, 빌드 직전에 빈 `NEXT_PUBLIC_*` 를
`unset` 한다. 두 규칙이 없으면 빈 값이 `.env.production.local` 을 무력화해 빌드는 성공하고
앱만 깨진다.

## 런타임 계약

- 포트 `3000`, `HOSTNAME=0.0.0.0`
- 생존 점검 `GET /api/health` — 프로세스가 응답하는지만 본다. 의존성은 보지 않는다
- **준비 점검 `GET /api/ready`** — DB `select 1` 을 2초 상한으로 확인하고, 실패하면 `503`.
  오케스트레이터 헬스체크는 이 경로를 봐야 한다. `/api/health` 만 보면 DB 커넥션이 막혀
  모든 페이지가 타임아웃하는 동안에도 정상으로 읽힌다 (2026-07-27 장애의 실제 경로)
- 서버 전용 시크릿은 컨테이너 환경변수로 주입한다

## DB 커넥션 모드

`src/lib/db.ts` 는 `DATABASE_URL` 의 **포트로** 풀 설정을 가른다.

| 포트   | 모드        | 풀       | prepared statement |
| ------ | ----------- | -------- | ------------------ |
| `5432` | session     | `max: 5` | 사용               |
| `6543` | transaction | `max: 5` | 사용 불가          |

컨테이너 배포는 장수명 프로세스이므로 **`5432`** 를 권장한다. 다만 배포 환경이 `6543` 을
설정하는 경우가 실제로 있으므로 코드는 두 모드를 모두 지탱해야 한다.

`6543` 의 풀은 한때 `max: 1` 이었다. 커넥션 하나가 막히는 순간 앱의 모든 DB 작업이 그 뒤에
큐잉되고, postgres-js 에는 쿼리 타임아웃이 없어 큐가 영영 안 풀린다 — 2026-07-27 에 이
경로로 모든 페이지가 524 를 냈다. 풀 크기는 단일 실패점을 없애는 완화책일 뿐이고, 실제
회수는 아래 롤 타임아웃이 한다.

### 롤 타임아웃 (`supabase/migrations/0017_app_role_timeouts.sql`)

transaction mode pooler 는 postgres-js 의 startup connection 파라미터를 **조용히 버린다**
(실측: `connection: { statement_timeout }` 을 줘도 백엔드는 그대로 `2min`). 그래서 앱에서는
이 값을 걸 수 없고, 회수는 서버가 해야 한다. 롤 설정은 pooler 를 거쳐도 그대로 적용된다.

| 설정                                  | 값    | 막는 것                                  |
| ------------------------------------- | ----- | ---------------------------------------- |
| `statement_timeout`                   | `15s` | 응답 없는 쿼리에 요청이 매달리는 것      |
| `lock_timeout`                        | `5s`  | `pg_advisory_xact_lock` 무한 대기        |
| `idle_in_transaction_session_timeout` | `15s` | 열린 트랜잭션 방치 — 이 장애의 직접 원인 |

## 하지 말 것

- `next start` 로 띄우기 — standalone 과 호환되지 않는다
- 서버 시크릿을 `--build-arg` 로 넘기기 — 이미지에 남는다
- 런타임에 `SKIP_ENV_VALIDATION` 켜기 — 검증이 통째로 무력화된다
- nixpacks 같은 자동 감지 빌더에 맡기기 — `next.config.ts` 를 읽지 않아 `next start` 를 고른다
