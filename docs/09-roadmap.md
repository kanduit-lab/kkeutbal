# 로드맵

| Field | Value |
|-------|-------|
| Type | technical-design |
| Audience | engineering |
| Status | draft |
| Source of truth | this document (단계 구분·MVP 경계) |
| Last reviewed | 2026-07-22 |

실행 단위 잔여 작업은 [`TODO.md`](../TODO.md)가 소유한다. 이 문서는 **순서와 경계**만 정한다.

## 전제

이 앱은 **실제 MT 날짜에 동작해야 의미가 있다.** 따라서 "완성도"가 아니라
"그날 판이 돌아가는가"를 기준으로 자른다. 못 끝낸 기능은 수동 대체 경로가 있어야 한다.

칩은 실물로 쓰므로 **앱이 없어도 게임 자체는 돌아간다.** 그래서 메인은 승패 기록과 족보 판독이고,
원격 베팅은 실물 칩이 모자랄 때 쓰는 보조다.

## 현재 상태 요약

기능 코드 대부분이 이미 구현돼 있다. 남은 것은 신규 기능이 아니라
**외부 설정 확정(Authentik, staging), 검증 공백 메우기(190 픽스처, E2E), 미사용 스키마 정리**다.

| 영역 | 상태 | 근거 |
|------|------|------|
| 화투 카드 모델 | 구현 완료 | `src/features/hwatu/cards.ts` |
| 섯다 엔진 | 구현 완료, 190 픽스처 검증 미실행 | `src/features/seotda/engine.ts`, `engine.test.ts`(`it.todo`), `seotda.fixtures.ts` 부재 |
| 고스톱 엔진 | 구현 완료, 테스트 없음 | `src/features/gostop/scoring.ts` — 테스트 파일 자체가 없음 |
| 인증 | Auth.js v5 + dev 로그인 동작, Authentik 미등록 | `src/lib/auth-config.ts`, `AUTH_DEV_LOGIN`/`AUTH_AUTHENTIK_*`(`src/lib/env.ts`) |
| DB · RLS | 마이그레이션 3개 적용됨 | init_schema, init_rls(`supabase/migrations/0001`), keep_alive_and_app_grants |
| 방 · 실시간 | 구현 완료 | `src/features/game/`(actions·queries·room-client), `src/lib/realtime/` |
| 베팅 · 칩 원장 | 구현 완료 | `src/features/betting/actions.ts`, `src/features/budget/actions.ts` |
| 족보 Advisor 수동 피커 | 구현 완료 | `src/features/jokbo-advisor/components/` |
| Vision 인식 | 구현 완료 | `src/features/jokbo-advisor/vision/actions.ts` |
| 정산 · 랭킹 | 구현 완료 | `src/features/ranking/queries.ts`, `src/app/rooms/[code]/result/`, `src/app/ranking/` |
| CI/CD | production 배포 활성, staging/preview 대기 | `.github/workflows/deploy.yml`, `.deploy.yml`(`preview.enabled: false`, `staging.enabled: false`) |
| Keep-alive | 동작 중 | `.github/workflows/keep-alive.yml`, 6시간 간격 cron |
| E2E | 미착수 | `e2e/` 디렉터리 없음 |
| `hand_records` 저장 | 스키마만 존재, Advisor가 저장 안 함 | `drizzle/schema.ts` `hand_records` 테이블 |
| `groups`/`group_members` | 스키마만 존재, 미사용 | `drizzle/schema.ts` |

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
   E2E · 리허설 · 폴리시      ← 배포 전 필수, 아직 공백
```

---

## 완료된 단계

Phase 0(스캐폴드)부터 핵심 경로 6단계(화투·섯다 / 인증·데이터 / 방·실시간 / 베팅·예산 /
Advisor / 정산·랭킹), Phase 7(vision), Phase 8(고스톱)까지 코드 레벨 구현이 끝나 있다.
세부 근거는 위 "현재 상태 요약" 표.

Authentik만 예외다 — env 스키마와 조건부 provider 로직(`AUTH_AUTHENTIK_ID/SECRET/ISSUER`
셋 다 있을 때만 활성)은 구현됐지만, 실제 Authentik 애플리케이션 등록·redirect URI 연결은
안 됐다. 지금은 `AUTH_DEV_LOGIN=true`의 이름 기반 게스트 로그인으로만 동작한다.

---

## 남은 작업 우선순위

구현 공백이 아니라 **검증·설정·정리** 공백이다. 실행 항목의 상세는 `TODO.md`가 소유한다.

### P0 — 배포 전 필수

1. **섯다 190 픽스처 검증** — `seotda.fixtures.ts` 사람이 직접 작성 후 `engine.test.ts`의
   `it.todo`를 실제 테스트로 전환. 엔진은 이미 동작하지만 실제 판 규칙과 대조된 적이 없다.
   리스크: 여기서 어긋나면 게임 결과 자체가 틀린다.
2. **고스톱 테스트 부재 해소** — `scoring.ts` 테스트 파일이 아예 없다. 경계값(4/5/9/10장)·
   배수 조합·`breakdown` 근거를 검증하는 테스트 작성.
3. **실물 리허설 1회 이상** — 실제 화투로 3판 이상 완주, 수동 개입(콘솔·DB 직접 수정) 0회
   확인. 지연·재접속·정산 오류는 코드 리뷰로 못 잡는다.

### P1 — 배포 확장

4. **Authentik OIDC 애플리케이션 등록** — provider 생성, redirect URI 연결, 로컬 로그인
   왕복 확인. 현재는 게스트 로그인 경로로만 검증 가능.
5. **staging 채널 전환** — `.deploy.yml`의 `preview.enabled`/`staging.enabled`를 `true`로
   바꾸기 전에 `ENV_FILE_BASE64` 시크릿 구성 필요. 지금은 production 단일 환경만 배포된다.
6. **모바일 실기기 리허설** — 한 손 조작, 어두운 조명 조건에서 확인. E2E로 대체 불가능한
   영역.

### P2 — 검증 자동화

7. **Playwright E2E 스위트** — `e2e/` 디렉터리 자체가 없다. 2컨텍스트 동기화, 재접속 복원,
   정산 흐름을 자동화. 지금까지는 전부 수동 확인에 의존했다.
8. **실시간 지연 실측** — 2기기 기준 Broadcast 왕복 p95 300ms 확인. 조기 검증 대상이었으나
   측정 기록이 문서에 남아있지 않다.

### P3 — 미사용 스키마 정리

9. **`hand_records` 저장 여부 결정** — 테이블은 있지만 Advisor가 쓰지 않는다. 판별 이력을
   남길지, 스키마를 뺄지 결정하고 문서화(`docs/05-jokbo-advisor.md`).
10. **`groups`/`group_members` 사용 여부 결정** — 스키마만 있고 어떤 기능도 참조하지 않는다.
    다음 기능(모임 단위 랭킹 등)이 없으면 스키마에서 제거하거나 명시적으로 보류 표시.

---

## 릴리스

- 태그는 핵심 경로 검증(P0) 완료 후 `v0.1.0`부터. 그 전에는 태그를 붙이지 않는다.
- 현재 배포는 production 채널 하나뿐이다(`.deploy.yml`). staging/preview는 P1 항목 완료 후
  전환.

## 리스크 순서

가장 먼저 깨질 것부터 검증한다. 코드 구현이 끝난 지금은 "아직 안 만들었다"가 아니라
"아직 안 맞춰봤다"가 리스크다.

1. **섯다 규칙 정확도** — 엔진은 있지만 190 픽스처 대조가 없다. 실제 플레이 그룹 룰과
   1회 대조 필요 (P0-1).
2. **고스톱 점수 정확도** — 테스트 자체가 없어 배수 파이프라인이 검증된 적 없다 (P0-2).
3. **실시간 지연·유실** — 측정 기록 없음. 현장 네트워크 조건에서 재확인 필요 (P2-8).
4. **현장 네트워크** — 실물 리허설에서만 드러난다. 완화책은 로컬 큐 + 스냅샷 복원
   (이미 구현됨, `src/lib/realtime/`).
