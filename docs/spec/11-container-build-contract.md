# 컨테이너 빌드와 런타임 환경

| Field | Value |
|-------|-------|
| Type | technical-design |
| Audience | maintainers / operators |
| Status | active |
| Source of truth | 이 문서는 컨테이너 빌드와 런타임 환경 계약을 소유한다 |
| Last reviewed | 2026-10-23 |

## Requirement

컨테이너 이미지는 Next.js standalone 산출물로 실행한다. 빌드 단계에는 공개 값만 전달하고, DB와 인증에 쓰는 비밀값은 실행 환경에서만 제공한다.

## Contract

`Dockerfile`은 `pnpm build`로 `.next/standalone/server.js`를 만들고 `node server.js`로 실행한다. `next start`는 standalone 이미지의 실행 진입점이 아니다.

빌드에 전달할 수 있는 값은 다음 공개 값뿐이다.

| 변수 | 용도 |
|------|------|
| `NEXT_PUBLIC_APP_URL` | 공개 앱 URL |

`DATABASE_URL`, `DATABASE_CA_CERT_BASE64`, `AUTH_SECRET`, 관리형 Realtime 공개 연결 값과 Vision API 키는
이미지 빌드 인자로 전달하지 않는다. 런타임 프로세스 환경에서만 제공하며, 파일 기반 주입과
Doppler 주입 경로는 현재 구성하지 않는다.

런타임의 실시간·DB 연결 변수는 다음 계약을 따른다.

| 변수 | 허용값 또는 조건 |
|------|------------------|
| `REALTIME_MODE` | `self` 또는 `supabase`. 비우면 `self`다. `self`는 long-running Node 프로세스에서만 허용한다. |
| `SUPABASE_URL` | `REALTIME_MODE=supabase`일 때만 읽고 그때 필수다. 런타임 설정 API가 브라우저에 공개한다. |
| `SUPABASE_PUBLISHABLE_KEY` | `REALTIME_MODE=supabase`일 때만 읽고 그때 필수인 공개 키다. |
| `DATABASE_TLS_MODE` | `disable`, `verify-system`, `verify-ca` 중 하나. |
| `DATABASE_CA_CERT_BASE64` | `DATABASE_TLS_MODE=verify-ca`일 때 필수. 다른 TLS 모드에서는 요구하지 않는다. |
| `DATABASE_POOL_MODE` | `session` 또는 `transaction`. |
| `DATABASE_LISTENER_URL` | `REALTIME_MODE=self`일 때만 읽는다. `DATABASE_POOL_MODE=transaction`과 함께 쓰면 필수다. direct 또는 session pool endpoint여야 하며 transaction endpoint는 허용하지 않는다. 기본 DB 연결이 `session`이면 생략할 수 있다. |

`REALTIME_MODE=self`는 같은 origin의 인증된 SSE 수신과 POST publish, PostgreSQL
`LISTEN/NOTIFY`, DB lease presence를 모두 요구한다. listener 연결은 session-capable이어야 하며,
요청 단위로 종료되는 환경이나 transaction pool 연결을 listener로 쓰면 기동을 실패시킨다.
`disable`은 신뢰할 수 있는 로컬 네트워크처럼 TLS가 별도 계층에서 보장되는 환경에만 사용한다.

서버 초기화 단계에서 런타임 필수값을 함께 검증한다. 하나라도 빠졌거나 형식이 맞지 않으면 요청을
처리하기 전에 누락된 키 이름만 포함한 구성 오류로 기동을 실패시킨다. `self`에서는 listener 연결도
초기화 단계에 확인하며, `room_connections` 테이블과 조회 권한이 없어도 기동하지 않는다.

컨테이너는 포트 `3000`에서 `HOSTNAME=0.0.0.0`으로 수신한다. `GET /api/health`는 프로세스 생존을, `GET /api/ready`는 DB 연결 가능 여부를 확인한다.

## Boundary

환경변수의 유효성 검사는 `src/lib/env.ts`가 소유한다. 실시간 전송·스냅샷 규약은 [`03-realtime-protocol.md`](03-realtime-protocol.md)가 소유한다. 데이터베이스 적용 절차는 [`../runbooks/01-database-migrations.md`](../runbooks/01-database-migrations.md)가 소유한다. 이 문서는 배포 자동화나 시크릿 공급자를 정하지 않는다.

## Verification

- 이미지 빌드에서는 `SKIP_ENV_VALIDATION=1`이 빌드 단계에만 적용되는지 확인한다.
- 실행 컨테이너에는 선택한 실시간 모드와 DB 연결에 필요한 런타임 환경변수가 제공되어야 한다.
- 기동 후 `/api/health`와 `/api/ready`를 각각 확인한다.
- `self`를 활성화하기 전, long-running Node 실행 환경과 session-capable listener 연결이 함께 있는지 확인한다.
- `DATABASE_POOL_MODE=transaction`에서 `self`를 활성화하면 session-capable `DATABASE_LISTENER_URL`이 없을 때 기동이 실패하는지 확인한다.
