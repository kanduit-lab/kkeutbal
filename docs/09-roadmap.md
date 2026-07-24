# 로드맵

| Field | Value |
|-------|-------|
| Type | technical-design |
| Audience | engineering |
| Status | active |
| Source of truth | this document (단계 구분·MVP 경계) |
| Last reviewed | 2026-07-24 |

실행 단위 잔여 작업은 [`TODO.md`](../TODO.md)가 소유한다. 이 문서는 **순서와 경계**만 정한다.

## 전제

이 앱은 **실제 MT 날짜에 동작해야 의미가 있다.** 따라서 "완성도"가 아니라
"그날 판이 돌아가는가"를 기준으로 자른다. 못 끝낸 기능은 수동 대체 경로가 있어야 한다.

칩은 실물로 쓰므로 **앱이 없어도 게임 자체는 돌아간다.** 그래서 메인은 승패 기록과 족보 판독이고,
원격 베팅은 실물 칩이 모자랄 때 쓰는 보조다.

우선순위 원칙은 위 전제에서 직접 나온다: **수동 대체 경로가 없는 것부터 검증한다.**
엔진 판정이 틀리면 사람이 그 자리에서 육안으로 교정할 수 있지만(룰은 사람이 안다),
배포·인증·실시간 라이브 경로가 죽으면 앱 자체가 없다 — 종이로 돌아가는 것 외에 대체가 없다.
2026-07-23 이전 판은 이 원칙과 반대로 엔진 검증(대체 경로 있음)을 P0에, 라이브 경로
증명(대체 경로 없음)을 P1 이하에 놓았고, P0 실물 리허설이 P1 Authentik 없이는 실행
불가능한 자기모순도 있었다(프로덕션에서 쓸 수 없는 이름 기반 로그인에 의존). 이 판에서 순서를 뒤집었다.

## 현재 상태 요약

핵심 기능과 순수 엔진 검증은 구현돼 있다. 남은 것은
**신규 DB 마이그레이션 적용, 실배포 라이브 경로 검증, 전체 사용자 흐름 E2E 확장**이다.

| 영역 | 상태 | 근거 |
|------|------|------|
| 화투 카드 모델 | 구현 완료 | `src/features/hwatu/cards.ts` |
| 섯다 엔진 | 구현·190조합 전수 테스트 완료 | `src/features/seotda/engine.ts`, `engine.test.ts` |
| 고스톱 엔진 | 구현·경계/배수 테스트 완료 | `src/features/gostop/scoring.ts`, `scoring.test.ts` |
| 포커 엔진 | 구현·10개 카테고리/입력 방어 테스트 완료 | `src/features/poker/engine.ts`, `engine.test.ts` |
| 인증 | Auth.js v5 내부 계정·게스트 토큰 동작, SSO는 관리자 화면에서 연결 가능 | `src/lib/auth.ts`, `registration_codes`/`auth_settings` |
| DB · RLS | 무결성 마이그레이션·RLS live 적용 완료 | `drizzle/migrations/0006`~`0011`, `supabase/migrations/0007`~`0008` |
| 방 · 실시간 | 구현 완료 | `src/features/game/`(actions·queries·room-client), `src/lib/realtime/` |
| 베팅 · 칩 원장 | 구현 완료 | `src/features/betting/actions.ts`, `src/features/budget/actions.ts` |
| 족보 Advisor 수동 피커 | 구현 완료 | `src/features/jokbo-advisor/components/` |
| Vision 인식 | 구현 완료 | `src/features/jokbo-advisor/vision/actions.ts` |
| 정산 · 랭킹 | 구현 완료 | `src/features/ranking/queries.ts`, `src/app/rooms/[code]/result/`, `src/app/ranking/` |
| CI/CD | production 배포 활성, staging/preview 대기 | `.github/workflows/deploy.yml`, `.deploy.yml`(`preview.enabled: false`, `staging.enabled: false`) |
| Keep-alive | 배포 환경 secret 설정 대기 | `.github/workflows/keep-alive.yml`, `/api/keep-alive` |
| E2E | 공개 화면 모바일 스모크 구현, 인증 후 전체 흐름 미구현 | `playwright.config.ts`, `e2e/public-surfaces.spec.ts` |
| 미사용 스키마 | 제거 확정(2026-07-23) — `groups`/`group_members`/`hand_records` 스키마에서 삭제 | `drizzle/schema.ts`, 근거는 `docs/design-decisions/` 001 |

이 표가 코드와 어긋나면 **코드를 따른다.**

## MVP 경계

MVP는 "고스톱과 vision 없이도 그날 판이 돌아가는가" 기준으로 정했다. 실제로는 둘 다 구현이
끝나 있어 이 경계는 이제 배포·검증 우선순위에만 의미가 있다 — 리허설이나 배포에서 문제가
생기면 vision·고스톱을 먼저 끄고 섯다 수동 경로로 좁힐 수 있다는 뜻이다.

```
┌─ 핵심 경로 (없으면 MT에서 못 쓴다) ────────────────┐
│  화투 카드 모델 + 섯다 엔진                        │
│  인증 + 스키마 + RLS                               │
│  방 생성/입장 + 실시간 동기화                      │
│  베팅 + 칩 원장 + 예산                             │
│  족보 Advisor (수동 피커)                          │
│  세션 정산 + 랭킹                                  │
└─────────────────────────────────────────────────────┘
   사진 인식 (vision)        ← 꺼도 수동으로 됨
   고스톱 엔진                ← 꺼도 섯다만 진행
   전체 흐름 E2E · 리허설      ← 배포 전 검증 필요
```

---

## 완료된 단계

Phase 0(스캐폴드)부터 핵심 경로 6단계(화투·섯다 / 인증·데이터 / 방·실시간 / 베팅·예산 /
Advisor / 정산·랭킹), Phase 7(vision), Phase 8(고스톱)까지 코드 레벨 구현이 끝나 있다.
세부 근거는 위 "현재 상태 요약" 표.

Authentik은 초기 관리자 로그인 뒤 `/admin`의 SSO 설정에서 Issuer URL·Client ID·Client secret을
입력하고 활성화한다. Authentik 애플리케이션의 Redirect URI 등록만 운영자가 마치면 된다.

---

## 남은 작업 우선순위

구현 공백이 아니라 **검증·설정** 공백이다. 순서는 전제의 원칙대로 "수동 대체 경로가 없는
것부터". 실행 항목의 상세는 `TODO.md`가 소유한다.

### P0 — 라이브 경로 증명 (대체 경로 없음 — 죽으면 MT 당일 앱 자체가 없다)

1. **MT 인증 구성 검증** — 관리자 화면에서 발급한 가입코드로 내부 계정 가입·로그인 왕복을
   실배포에서 확인한다. Authentik OIDC를 쓸 경우에는 애플리케이션 등록과 redirect URI 연결도
   함께 확인한다.
2. **실배포 스모크 1회** — 배포된 앱에서 실기기 2대로 전체 플로우 완주: 로그인 → 방 생성 →
   입장 → 베팅 → 동기화 → 판 종료 → 정산 → 랭킹. "구현 완료"가 배포 상태로 엔드투엔드
   돌아간 적이 아직 한 번도 없다 — 정보량이 가장 큰 단일 검증이다. Broadcast 왕복 p95
   300ms 실측(구 "실시간 지연 조기 측정")을 이 스모크에서 같이 잰다.
3. **실물 리허설** — 실제 화투로 3판 이상, 수동 개입(콘솔·DB 직접 수정) 0회 완주.
   실기기 조건(한 손 조작, 어두운 조명)도 여기서 함께 확인한다. 지연·재접속·정산 오류는
   코드 리뷰로 못 잡는다.

### P1 — 정확도 검증

섯다 190조합, 고스톱 경계·배수, 포커 10개 카테고리의 순수 엔진 자동 검증은 완료했다.
남은 정확도 검증은 실제 플레이 그룹 룰과 점수표를 대조하는 실물 리허설에 포함한다.

### P2 — 자동화·배포 확장

1. **Playwright E2E 전체 흐름 확장** — 공개 로그인·소개 화면 모바일 스모크는 구현됐다.
   가입코드/로그인 fixture를 마련해 2컨텍스트 동기화, 재접속 복원, 정산 흐름을 자동화한다.
2. **staging/preview 채널 전환** — `ENV_FILE_BASE64` 시크릿 구성 후 `.deploy.yml`의
   `preview.enabled`/`staging.enabled`를 `true`로. MT를 게이팅하지 않는 개발 편의 항목.

구 P3(미사용 스키마 정리)는 2026-07-23 **제거로 확정**되어 우선순위 목록에서 빠졌다 —
`groups`/`group_members`/`hand_records`를 스키마에서 삭제. 근거는
`docs/design-decisions/` 001, 반영 상태는 `TODO.md` Completed.

---

## 릴리스

- 태그는 P0(라이브 경로) + P1(정확도) 완료 후 `v0.1.0`부터. 그 전에는 태그를 붙이지 않는다.
- 현재 배포는 production 채널 하나뿐이다(`.deploy.yml`). staging/preview는 P2 항목 완료 후
  전환.

## 리스크 순서

가장 먼저 깨질 것부터 검증한다. 정렬 기준은 "수동 대체 경로가 없는 것부터".

1. **라이브 경로 미증명** — 배포+인증+실시간을 엮은 엔드투엔드가 실배포 상태로 돈 적이 없다.
   여기가 죽으면 대체 경로가 없다 — 종이 기록으로 회귀 (P0-2).
2. **인증 경로 미검증** — 가입코드 확인부터 내부 계정 로그인까지 실배포 왕복이 아직 없다.
   P0 전체의 선행 조건 (P0-1).
3. **향후 DB 마이그레이션 드리프트** — 현재 live DB와 Drizzle 이력은 동기화됐다. 이후 변경도
   `docs/08-database-migrations.md` 순서로만 적용해 SQL과 이력이 갈라지지 않게 해야 한다.
4. **현장 네트워크** — 실물 리허설에서만 드러난다. 완화책은 로컬 큐 + 스냅샷 복원
   (이미 구현됨, `src/lib/realtime/`).
