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

`ARG` 는 선언한 스테이지의 `RUN` 에 환경변수로 노출된다. 그래서 `ENV` 로 승격하지 않는다 —
승격하면 전달되지 않았을 때 빈 문자열이 `.env.production.local` 의 값을 덮어써서 hub 경로가
조용히 깨진다. 두 경로가 서로를 밟지 않는 유일한 지점이다.

## 런타임 계약

- 포트 `3000`, `HOSTNAME=0.0.0.0`
- 헬스체크 `GET /api/health` (`.deploy.yml` 의 `health_path` 와 같아야 한다)
- 서버 전용 시크릿은 컨테이너 환경변수로 주입한다

## DB 커넥션 모드

`src/lib/db.ts` 는 `DATABASE_URL` 의 **포트로** 풀 설정을 가른다.

| 포트   | 모드        | 풀       | prepared statement |
| ------ | ----------- | -------- | ------------------ |
| `5432` | session     | `max: 5` | 사용               |
| `6543` | transaction | `max: 1` | 사용 불가          |

컨테이너 배포는 장수명 프로세스이므로 **`5432`** 다. `6543` 을 쓰면 인스턴스당 커넥션이
1개로 좁혀져 동시 요청이 직렬화된다. 서버리스(람다) 배포에서만 `6543` 이 맞다.

## 하지 말 것

- `next start` 로 띄우기 — standalone 과 호환되지 않는다
- 서버 시크릿을 `--build-arg` 로 넘기기 — 이미지에 남는다
- 런타임에 `SKIP_ENV_VALIDATION` 켜기 — 검증이 통째로 무력화된다
- nixpacks 같은 자동 감지 빌더에 맡기기 — `next.config.ts` 를 읽지 않아 `next start` 를 고른다
