# 컨테이너 빌드와 런타임 환경

| Field | Value |
|-------|-------|
| Type | technical-design |
| Audience | maintainers / operators |
| Status | active |
| Source of truth | `Dockerfile`, `next.config.ts`, `src/lib/env.ts` |
| Last reviewed | 2026-10-21 |

## Requirement

컨테이너 이미지는 Next.js standalone 산출물로 실행한다. 빌드 단계에는 공개 값만 전달하고, DB와 인증에 쓰는 비밀값은 실행 환경에서만 제공한다.

## Contract

`Dockerfile`은 `pnpm build`로 `.next/standalone/server.js`를 만들고 `node server.js`로 실행한다. `next start`는 standalone 이미지의 실행 진입점이 아니다.

빌드에 전달할 수 있는 값은 다음 공개 값뿐이다.

| 변수 | 용도 |
|------|------|
| `NEXT_PUBLIC_APP_URL` | 공개 앱 URL |
| `NEXT_PUBLIC_SUPABASE_URL` | 브라우저의 Supabase 연결 URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 브라우저의 Supabase publishable key |

`DATABASE_URL`, `DATABASE_CA_CERT_BASE64`, `AUTH_SECRET`과 Vision API 키는 이미지 빌드 인자나 파일로 전달하지 않는다. 런타임 프로세스 환경에서만 제공하며, 파일 기반 주입과 Doppler 주입 경로는 현재 구성하지 않는다.

서버 초기화 단계에서 서버 필수값과 `NEXT_PUBLIC_*` 필수값을 함께 검증한다. 하나라도 빠졌거나 형식이 맞지 않으면 요청을 처리하기 전에 누락된 키 이름만 포함한 구성 오류로 기동을 실패시킨다.

컨테이너는 포트 `3000`에서 `HOSTNAME=0.0.0.0`으로 수신한다. `GET /api/health`는 프로세스 생존을, `GET /api/ready`는 DB 연결 가능 여부를 확인한다.

## Boundary

환경변수의 유효성 검사는 `src/lib/env.ts`가 소유한다. 데이터베이스 적용 절차는 [`../runbooks/01-database-migrations.md`](../runbooks/01-database-migrations.md)가 소유한다. 이 문서는 배포 자동화나 시크릿 공급자를 정하지 않는다.

## Verification

- 이미지 빌드에서는 `SKIP_ENV_VALIDATION=1`이 빌드 단계에만 적용되는지 확인한다.
- 실행 컨테이너에는 서버와 `NEXT_PUBLIC_*` 필수 환경변수가 제공되어야 한다.
- 기동 후 `/api/health`와 `/api/ready`를 각각 확인한다.
