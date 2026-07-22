# 족보 Advisor — 수동 입력 · 사진 인식

| Field | Value |
|-------|-------|
| Type | technical-design |
| Audience | engineering / QA |
| Status | active |
| Source of truth | this document (입력 경로·인식 파이프라인). 판정 규칙 자체는 `04-game-engines.md` 소유 |
| Last reviewed | 2026-07-22 |

## Context

초심자가 있으면 판이 멈춘다. 특히 섯다 특수패(알리·독사·세륙…)와 고스톱 점수 계산, 포커 족보
서열. "내 패가 뭔지" 즉시 보여주는 것이 목적이며, 전략 조언(콜/다이 추천)은 범위 밖이다.

관련 파일:
- `src/features/jokbo-advisor/components/advisor-client.tsx` — 화면 전체 상태·탭·판정 렌더링
- `src/features/jokbo-advisor/components/card-picker.tsx` — 화투 카드 수동 그리드(섯다/고스톱)
- `src/features/jokbo-advisor/components/poker-picker.tsx` — 트럼프 카드 수동 그리드(포커)
- `src/features/jokbo-advisor/stats.ts` — 서열 순위·승률(섯다), 등장 확률(포커) 통계
- `src/features/jokbo-advisor/vision/actions.ts` — vision 인식 Server Action
- `src/app/advisor/page.tsx` — 진입 라우트, `visionEnabled` 계산
- `src/components/hwatu-card.tsx` — 화투 카드 CSS/이모지 비주얼(`HwatuCardView`), 피커·가이드가 공유

## 탭 3개, 상태는 2개

`AdvisorClient`는 섯다/고스톱/포커 탭(`AdvisorTab`)을 갖는다. 화투 카드 선택(`selected:
Set<CardId>`)과 포커 카드 선택(`pokerSelected: Set<string>`)은 별도 state다 — 포커는 화투
덱과 무관한 트럼프 카드를 쓰기 때문이다.

```
                  ┌──────────────────────┐
   수동 피커 ────►│  selected: Set<CardId> │──► evaluateSeotdaHand / scoreGostop ──► 즉시 렌더
   사진 인식 ────►│  (useState, 클라이언트) │       (섯다 탭이면 seotdaStats 로 통계도 계산)
                  └──────────────────────┘

   포커 피커  ───►  pokerSelected: Set<string>  ──► evaluatePokerHand ──► POKER_CATEGORY_STATS 조회
```

섯다↔고스톱처럼 화투 탭끼리 전환하면 `selected`가 초기화된다. 포커 탭으로/포커 탭에서 전환할
때는 `selected`를 건드리지 않는 분기가 있지만(`switchTab`의 `next !== 'poker'` 조건), 포커
탭에서는 애초에 `selected`를 쓰지 않으므로 체감 동작은 "포커 선택은 절대 초기화되지 않는다"와
같다.

두 입력 경로(수동 피커, 사진 인식) 모두 최종적으로 `selected` state를 채울 뿐이다. 별도의
"확정" 버튼은 없다 — `selected`/`pokerSelected`가 바뀔 때마다 `useMemo`로 판정이 즉시
재계산되어 표시된다. vision 인식 결과도 `setSelected(new Set(ids))`로 그대로 대입되며, 이후
사용자가 `CardPicker`에서 자유롭게 토글해 수정할 수 있다. 인식이 죽어도(`visionEnabled=false`,
네트워크 실패 등) 수동 피커는 독립적으로 동작한다. 포커 탭에는 사진 인식 자체가 없다(아래
"경로 2" 참고).

## 경로 1 — 수동 카드 피커

기본 경로. `card-picker.tsx`가 렌더링, 토글 로직은 `advisor-client.tsx`가 소유한다.

- `deckFor(gameType)`로 덱을 가져와 월별로 그룹핑. 섯다는 1~10월 20장, 고스톱은 48장 전체.
- 그리드 열 수: 섯다 `grid-cols-2`, 고스톱 `grid-cols-4`.
- 선택 개수 상한(`maxSelect`, `AdvisorClient` 소유): 섯다 2장, 고스톱 30장(사실상 무제한 — 획득 패 집합).
- 이미 상한에 도달하면 미선택 카드는 `disabled` + `opacity-30`.
- 선택 즉시 판정 결과가 갱신된다(별도 확인 버튼 없음).
- "최근 선택 기억" 같은 로컬 저장 기능은 **없다** — 게임 타입 전환 시 `selected`는 매번 초기화된다.

카드 식별은 `HwatuCard.id`(`CardId`) 문자열로만 한다. UI 상태·vision 출력·엔진 입력이 전부 같은 키를 쓴다.

## 경로 2 — 사진 인식 (Claude vision)

### 파이프라인 (실제 구현)

```
파일 선택 (input type=file, capture=environment)
  → 클라이언트 리사이즈: createImageBitmap → canvas, 장변 1568px, JPEG q=0.8 → data URL
  → recognizeHand() Server Action 호출 (imageDataUrl, gameType)
  → 서버: currentUserId() 로그인 검사 → data URL 정규식 파싱(jpeg/png/webp, 5MB 상한)
  → Anthropic Messages API 호출 (텍스트 프롬프트로 "JSON만 응답" 지시, 구조화 출력 강제 아님)
  → 응답 텍스트에서 정규식 `/\{[\s\S]*\}/`로 JSON 블록 추출 → JSON.parse → zod 파싱
  → (month, kind, ssangpi) → CardId 정규화
  → 실패 시 어느 단계든 ActionResult.fail() 반환, 부분 반영 없음
  → 성공 시 클라이언트가 setSelected(new Set(ids))로 피커에 그대로 프리필
```

- 모델: `env.JOKBO_VISION_MODEL` (기본값 `claude-sonnet-5`). 재시도·모델 승격 로직은 없다.
- API 키는 서버 전용(`env.ANTHROPIC_API_KEY`). 브라우저는 Anthropic API를 직접 호출하지 않는다.
- 클라이언트 리사이즈는 업로드 시간·토큰 비용을 줄이기 위함.
- **구조화 출력(tool use / JSON mode)을 쓰지 않는다.** 프롬프트로 "다음 JSON 형식으로만 응답해라"를
  지시하고, 응답 텍스트에서 첫 `{...}` 블록을 정규식으로 뽑아 파싱한다. 모델이 JSON 앞뒤로 텍스트를
  붙이면 정규식이 흡수하지만, JSON 자체가 깨지면(중첩 오류 등) 그대로 실패 처리된다.

### 인식 스키마와 정규화

모델 응답 zod 스키마 (`vision/actions.ts` `visionSchema`):

```ts
z.object({
  cards: z.array(z.object({
    month: z.number().int().min(1).max(12),
    kind: z.enum(['gwang', 'yeol', 'tti', 'pi']),
    ssangpi: z.boolean().optional(),   // 피일 때만 의미. 11월/12월 쌍피 구분용
  })).max(12),
  confidence: z.number().min(0).max(1),  // 카드별이 아니라 응답 전체에 대한 단일 값
  note: z.string().max(200).optional(),
})
```

`(month, kind, ssangpi)` → `CardId` 정규화(`toCardIds`):
- `cardsOfMonth(month)`에서 `kind` 일치, `gameType === 'seotda'`면 `card.seotda` 플래그도 검사(섯다 덱엔 피가 없음).
- `kind === 'pi'`이고 `ssangpi`가 명시되면 `piValue`(1 또는 2)로 추가 필터.
- 후보 중 아직 배정 안 된(`used` Set에 없는) 첫 카드를 사용 — 같은 (월,종류,쌍피 여부) 조합이
  여러 장 인식돼도 중복 CardId를 만들지 않는다.
- 매칭 실패한 항목은 조용히 버려진다(별도 "미확정" 상태 없음).

프롬프트는 섯다/고스톱에 따라 힌트를 분기한다: 섯다는 "보통 2장, 1~10월 광/열끗/띠만(피 없음)",
고스톱은 "여러 장일 수 있음"을 모델에게 명시한다.

### 확신도 처리 (실제 UX)

문서에 자주 등장하는 "카드별 신뢰도 색상 표시", "0.6 미만은 프리필 안 함" 같은 단계는 **구현돼 있지 않다**.
실제로는:

- `confidence`는 응답 전체에 대한 단일 값이며, 인식된 카드는 confidence 값과 무관하게 전부
  `setSelected`로 프리필된다(개수는 `maxSelect`로만 자름).
- UX 신호는 토스트 문구뿐: `카드 N장 인식 (확신도 XX%) — 잘못 짚었으면 직접 고치세요`.
  `confidence >= 0.9`면 `success` 토스트, 그 외엔 `info` 토스트로 색만 달라진다.
- `imageQuality`(good/fair/poor) 같은 필드는 스키마에 없다. 재촬영 가이드는 "카드 0장 인식" 케이스에서만
  뜬다(`카드를 인식하지 못했습니다. 더 밝은 곳에서 다시 찍어보세요`).

### 비용·남용 방지 — 미구현

레이트 리밋, 이미지 해시 캐시, 인식 로그 저장은 **코드에 없다**. `recognizeHand`는 로그인 사용자면
호출마다 매번 Anthropic API를 호출한다. 방어는 다음 두 가지뿐이다:
- `JOKBO_VISION_ENABLED=false` 또는 `ANTHROPIC_API_KEY` 미설정이면 서버가 즉시 `fail()`을 반환한다
  (`src/app/advisor/page.tsx`가 이 조합으로 `visionEnabled`를 계산해 버튼에 전달).
- 이미지 크기 5MB 상한(`MAX_IMAGE_BYTES`, base64 길이 기준 추정치).

레이트 리밋·캐시·로깅이 필요해지면 이 섹션을 갱신하고 실제 구현 위치를 적을 것.

### 업로드 UI 노출 — "숨김"이 아니라 "비활성"

`visionEnabled=false`일 때 업로드 버튼은 **숨겨지지 않는다**. `disabled` 상태로 계속 렌더링되고,
`disabledReason="사진 인식이 꺼져 있습니다 (ANTHROPIC_API_KEY 필요)"`가 표시된다
(`VisionCapture` 컴포넌트, `ui-rules`의 권한 게이팅 패턴). 즉 사용자는 기능이 존재한다는 것 자체는
항상 볼 수 있고, 왜 못 쓰는지도 안내받는다.

## 가시성 규칙

- 손패 판독은 `AdvisorClient`의 로컬 React state로만 존재한다. Supabase Realtime 채널을 구독하거나
  브로드캐스트하는 코드가 이 feature 안에 없다 — 다른 참가자에게 노출될 경로 자체가 없다.
- `recognizeHand`는 인식 결과를 어디에도 저장하지 않는다. 응답은 호출한 클라이언트에게만 반환되고
  끝난다.

## 실패 모드

| 실패 | 코드 동작 |
|------|-----------|
| 로그인 안 됨 | `recognizeHand`가 `fail('로그인이 필요합니다')` 즉시 반환 |
| vision 비활성 (`JOKBO_VISION_ENABLED=false` 또는 키 없음) | 업로드 버튼 `disabled` + 사유 툴팁. 수동 피커는 정상 동작 |
| 이미지 형식/크기 위반 | 서버 정규식·크기 검사에서 `fail()`, Anthropic 호출 전에 차단 |
| Anthropic 응답에 텍스트 블록 없음 | `fail('인식 결과를 받지 못했습니다')` |
| 응답에서 JSON 블록을 못 찾음 / `JSON.parse` 실패 / zod 검증 실패 | `fail('인식 결과 형식이 올바르지 않습니다')`, 부분 반영 없음 |
| API 호출 자체 예외(네트워크 등) | `catch`에서 `console.error` 후 `fail('사진 인식에 실패했습니다. 수동 선택을 사용하세요')` |
| 카드 0장 인식 | 클라이언트가 `cardIds.length === 0`이면 에러 토스트, `onRecognized` 호출 안 함(기존 선택 유지) |
| 인식된 카드가 실제와 다름 | 사용자가 `CardPicker`에서 직접 토글해 수정. 수정 이력을 별도로 기록하지는 않는다 |

## hand_records — 미구현

`drizzle/schema.ts`에 `hand_records` 테이블이 스키마로는 존재하지만, jokbo-advisor 어떤 코드도
이 테이블에 쓰지 않는다. 인식 요청·수정 이력·오인식 패턴 추적은 전부 미구현이다. 판정은 순수
클라이언트 메모리 상에서만 일어나고 페이지를 벗어나면 사라진다. 저장이 필요해지면 이 섹션과
`02-data-model.md`를 함께 갱신할 것.

## 수용 기준

- [x] 인식 기능을 완전히 꺼도 족보 판독이 100% 가능하다 (`CardPicker`는 vision과 독립).
- [x] 인식 결과가 틀렸을 때 피커에서 바로 토글해 수정 가능하다(탭 1회 토글, 확정 단계 없음).
- [x] 모델 응답이 스키마를 벗어나면 어떤 값도 상태에 반영되지 않는다(`fail()` 반환, 부분 매핑 없음).
- [x] 손패 판독 결과가 다른 참가자에게 노출될 경로가 코드에 없다(브로드캐스트 미사용).
- [ ] 인식 요청/결과를 기록해 오인식 패턴을 추적한다 — **미구현**.

## Open Questions

- [ ] 여러 장이 겹쳐 놓인 실제 판 사진에서 인식률이 실용 수준인지 사전 검증 필요
      (실물 화투 촬영 샘플 20장 정도로 1회 측정).
- [ ] 고스톱 획득 패 전체 촬영은 카드 수가 많다. 화면 분할 촬영(여러 장) 지원 여부 결정 필요.
- [ ] 레이트 리밋·이미지 해시 캐시가 필요한 시점(실사용 트래픽/비용 확인 후)과 구현 위치.
