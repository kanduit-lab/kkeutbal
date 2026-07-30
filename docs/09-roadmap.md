# 로드맵

| Field | Value |
|-------|-------|
| Type | technical-design |
| Audience | engineering |
| Status | active |
| Source of truth | 구현 현황은 코드·스키마, 이 문서는 단계 구분·MVP 경계 |
| Last reviewed | 2026-07-30 |

실행 단위 잔여 작업은 [`TODO.md`](../TODO.md)가 소유한다. 이 문서는 **순서와 경계**만 정한다.

## 전제

이 앱은 **실제 MT 날짜에 동작해야 의미가 있다.** 따라서 "완성도"가 아니라
"그날 판이 돌아가는가"를 기준으로 자른다. 못 끝낸 기능은 수동 대체 경로가 있어야 한다.

칩은 실물로 쓰므로 **앱이 없어도 게임 자체는 돌아간다.** 그래서 메인은 승패 기록과 족보 판독이고,
원격 베팅은 실물 칩이 모자랄 때 쓰는 보조다.

우선순위 원칙은 위 전제에서 직접 나온다: **수동 대체 경로가 없는 것부터 검증한다.**
엔진 판정이 틀리면 사람이 그 자리에서 육안으로 교정할 수 있지만(룰은 사람이 안다),
배포·인증·실시간 라이브 경로가 죽으면 종이 기록으로 돌아가는 것 외에 대체가 없다.

## 현재 상태 요약

코드 레벨 구현은 핵심 경로 전체에서 끝났다. 남은 것은 **실물·실배포에서만 확인되는 것들**이다.

아래 표의 "구현 완료"는 서버 로직과 상태 전이 기준이다. 이 표가 코드와 어긋나면 **코드를 따른다.**

| 영역 | 상태 | 근거 |
|------|------|------|
| 화투 카드 모델 | 구현 완료 | `src/features/hwatu/cards.ts` |
| 섯다 엔진 | 구현·190조합 전수 테스트 완료 | `src/features/seotda/engine.ts`, `engine.test.ts` |
| 고스톱 엔진 | 구현·경계/배수 테스트 완료 | `src/features/gostop/scoring.ts`, `scoring.test.ts` |
| 포커 엔진 | 구현·10개 카테고리/입력 방어 테스트 완료 | `src/features/poker/engine.ts`, `engine.test.ts` |
| 인증 | Auth.js v5 내부 계정·게스트 토큰 동작. SSO는 관리자 화면에서 연결 설정, `/account`에서 계정별 연결 | `src/lib/auth.ts`와 `auth-providers`·`provider-account-resolution`·`sso-link-resolution` |
| DB · RLS | 무결성 마이그레이션·RLS live 적용 완료 | `drizzle/migrations/`, `supabase/migrations/` |
| 방 · 실시간 | 서버·상태 전이 구현 완료. Broadcast 재구독·백오프·dedup·이벤트별 refetch 정책까지 | `src/features/game/`, `src/lib/realtime/` |
| 베팅 · 칩 원장 | 금액 검증·잔액 원장 구현 완료 | `src/features/betting/`, `src/features/budget/` |
| 베팅 턴 강제 | 구현 완료. 서버가 차례를 검사하고 위반은 `errors.notYourTurn`. 좌석 강조·시트가 같은 순수 함수를 쓴다 | `src/features/game/turn-order.ts`, `src/features/betting/bet-semantics.ts` |
| 판 자동 종료 | 구현 완료. 1인 생존·콜 완료를 감지해 베팅 트랜잭션 안에서 종료·정산까지 간다 | `src/features/betting/round-completion.ts`, `src/features/game/round-finalize.ts` |
| 레이즈 배수·상한 | 구현 완료. `free`/`ttadang`/`pot_limit` 3종을 방 만들기에서 고르고 서버가 강제한다 | `src/features/betting/raise-rule.ts` |
| 검증 가능한 섯다 딜 | 구현 완료. 시드 commit-reveal → 봉인 → 개인 손패 → 종료 후 덱 재계산 감사까지 e2e가 매 실행 검증한다 | `src/features/fairness/`, `e2e/authenticated-room.spec.ts` |
| 족보 Advisor | 수동 피커·포커 설명·부분 선택 미리보기 구현 완료 | `src/features/jokbo-advisor/components/` |
| Vision 인식 | 구현 완료 | `src/features/jokbo-advisor/vision/actions.ts` |
| 정산 · 랭킹 | 집계·이체 계산 구현 완료 | `src/features/ranking/`, `src/app/rooms/[code]/result/`, `src/app/ranking/` |
| 고정 뷰포트 UI | 목록·조회·방·모니터 화면이 문서 스크롤을 만들지 않고, e2e가 그 불변식을 지킨다 | `src/components/ui/page-shell.tsx`, `e2e/fixed-viewport.spec.ts` |
| 자동 검증 | 단위 342개(순수 엔진 + jsdom 컴포넌트), e2e 88개(모바일·데스크톱 두 프로젝트, 방 수명주기 포함) | `vitest.config.ts`, `playwright.config.ts`, `test/dom/` |
| CI/CD | **배포가 동작하지 않는다.** `develop` 푸시마다 워크플로가 0초에 실패하고 staging에 올라간 적이 없다 | `.github/workflows/deploy.yml`, `.deploy.yml` |

## MVP 경계

MVP는 "고스톱과 vision 없이도 그날 판이 돌아가는가" 기준으로 정했다. 실제로는 둘 다 구현이
끝나 있어, 이 경계는 이제 리허설이나 배포에서 문제가 생겼을 때 vision·고스톱을 먼저 끄고
섯다 수동 경로로 좁히는 후퇴선으로만 쓴다.

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
```

---

## 남은 작업 우선순위

순서: 배포 → 실경로 검증 → 실물 리허설 → 회귀 가드 보강.

코드 공백이 아니라 **증명 공백**이 남았다. 판 진행 규칙(차례·자동 종료·레이즈 상한)은 서버가
강제하고 자동 스위트가 정상 경로를 훑지만, 배포된 앱이 실기기 두 대에서 끝까지 돈 적이 없다.

1. **배포가 먼저다.** 지금은 `develop` 푸시가 워크플로 시작 자체에 실패해서 그 뒤 모든 실경로
   검증이 막혀 있다. 이게 풀리지 않으면 아래 항목은 순서를 논할 것도 없다.
2. **실경로 검증** — 실배포 2기기 스모크, SSO 연결 왕복. 둘 다 코드로는 확인할 수 없는 것이
   남았다(실제 OAuth 왕복, 실제 네트워크에서의 Broadcast 왕복 지연).
3. **실물 리허설** — 실제 화투로 3판 이상. 규칙이 서버에서 강제되는 지금이 리허설의 정보량이
   가장 큰 시점이다(사람이 순서를 지킨 결과가 아니라 서버가 지킨 결과를 본다).
4. **회귀 가드 보강** — 재접속·복원 e2e, Server Action 경쟁 상태 통합 테스트. 브라우저로
   재현하기 어려운 것만 남았다.

실행 항목과 완료 기준은 [`TODO.md`](../TODO.md)가, 조사 근거와 미확정 설계 질문은
[`docs/12-handoff.md`](12-handoff.md)가 소유한다.

### 엔진 정확도

섯다 190조합, 고스톱 경계·배수, 포커 10개 카테고리의 순수 엔진 자동 검증은 완료했다. 남은
정확도 검증은 실제 플레이 그룹 룰과 점수표를 대조하는 실물 리허설에 포함한다.

---

## 릴리스

- 태그는 라이브 경로 검증이 끝난 뒤 `v0.1.0`부터. 그 전에는 태그를 붙이지 않는다.
- 현재 배포 채널은 production 하나뿐이다(`.deploy.yml`). staging/preview 전환(`ENV_FILE_BASE64`
  시크릿 구성)은 MT를 게이팅하지 않는 개발 편의 항목이다 — 단, 배포 워크플로 자체가 실패하는
  문제는 편의 항목이 아니라 1순위다.

## 리스크 순서

가장 먼저 깨질 것부터 검증한다. 정렬 기준은 "수동 대체 경로가 없는 것부터".

1. **배포 파이프라인 실패** — 푸시가 워크플로 시작 단계에서 죽는다. 여기가 막히면 아래 전부가
   막힌다.
2. **라이브 경로 미증명** — 배포+인증+실시간을 엮은 엔드투엔드가 실배포 상태로 돈 적이 없다.
   여기가 죽으면 종이 기록으로 회귀하는 것 말고 대체가 없다.
3. **인증 경로 미검증** — 가입코드 확인부터 내부 계정 로그인까지 실배포 왕복이 아직 없다.
   SSO는 Authentik 인스턴스가 없어 OAuth 왕복 자체가 미검증이다.
4. **향후 DB 마이그레이션 드리프트** — 현재 live DB와 Drizzle 이력은 동기화됐다. 이후 변경도
   `docs/08-database-migrations.md` 순서로만 적용해 SQL과 이력이 갈라지지 않게 해야 한다.
5. **현장 네트워크** — 실물 리허설에서만 드러난다. 완화책은 액션 성공 뒤 스냅샷 복원,
   이벤트 수신 refetch·폴링·재연결이다. 로컬 액션 큐는 구현하지 않았다.
6. **런타임 값의 모양** — 타입 선언이 런타임을 보장하지 않는 경로가 남아 있다. drizzle raw
   `execute`가 파싱되지 않은 문자열을 돌려주는 것을 타입·lint·단위 테스트가 전부 놓쳐 검증 딜이
   죽어 있었다([`docs/12-handoff.md`](12-handoff.md) "함정"). 같은 형태의 경계는 실행해 보는 것
   외에 탐지 수단이 없다.
