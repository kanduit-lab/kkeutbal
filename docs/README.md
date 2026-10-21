# 문서 색인

| Field | Value |
|-------|-------|
| Type | README |
| Audience | maintainers / operators |
| Status | active |
| Source of truth | 이 문서는 문서 소유 관계, 각 문서는 해당 계약 |
| Last reviewed | 2026-10-21 |

## 기술 명세

| 문서 | 소유 범위 |
|------|-----------|
| [`spec/01-architecture.md`](spec/01-architecture.md) | 시스템 경계와 런타임 구성 |
| [`spec/02-data-model.md`](spec/02-data-model.md) | 데이터 모델, 권한, 무결성 |
| [`spec/03-realtime-protocol.md`](spec/03-realtime-protocol.md) | Supabase·self 전송 모드와 스냅샷 동기화 계약 |
| [`spec/04-game-engines.md`](spec/04-game-engines.md) | 화투, 섯다, 고스톱, 포커 규칙 엔진 |
| [`spec/07-auth-and-security.md`](spec/07-auth-and-security.md) | 인증, 역할, 보안 경계 |
| [`spec/10-virtual-credit-and-fair-play.md`](spec/10-virtual-credit-and-fair-play.md) | 가상 크레딧과 검증 가능한 섯다 딜 |
| [`spec/11-container-build-contract.md`](spec/11-container-build-contract.md) | 컨테이너 빌드, 실시간 모드, DB 런타임 환경 계약 |

## 운영 절차

| 문서 | 소유 범위 |
|------|-----------|
| [`runbooks/01-database-migrations.md`](runbooks/01-database-migrations.md) | 데이터베이스 마이그레이션 적용, 확인, 복구와 self realtime 적용 순서 |

남은 작업은 루트의 [`TODO.md`](../TODO.md)가 소유한다. 설계 근거 자산은 로컬 전용 `docs/design-rationale/`에 두며, 이 색인과 추적 문서에서는 참조하지 않는다.
