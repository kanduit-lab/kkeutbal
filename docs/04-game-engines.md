# 게임 엔진 — 화투 · 섯다 · 고스톱

| Field | Value |
|-------|-------|
| Type | technical-design |
| Audience | engineering / QA |
| Status | draft |
| Source of truth | this document (카드 모델·족보 규칙·엔진 계약) |
| Last reviewed | 2026-07-22 |

구현: `src/features/hwatu/`, `src/features/seotda/`, `src/features/gostop/`.

## 설계 원칙

1. **엔진은 순수 함수다.** 입력은 카드 배열과 룰 프리셋, 출력은 판정 결과. I/O·DB·시간·난수 금지.
   테스트 가능성이 이 프로젝트에서 가장 중요한 품질 축이다 — 규칙이 틀리면 앱 전체가 무의미하다.
2. **지역 룰은 데이터로 뺀다.** 하드코딩하면 "우리 동네 룰"마다 코드를 고쳐야 한다.
   룰은 `rule_preset` jsonb로 방에 저장되고 엔진에 인자로 들어간다.
3. **카드 모델은 하나다.** 섯다와 고스톱은 같은 화투 48장을 쓴다. 카드 정의를 두 번 만들지 않는다.

## 화투 카드 모델

48장 = 12개월 × 4장. 섯다는 그중 1~10월 각 2장(총 20장)만 쓴다.

```ts
type Month = 1|2|3|4|5|6|7|8|9|10|11|12
type CardKind = 'gwang' | 'yeol' | 'tti' | 'pi'   // 광 · 열끗 · 띠 · 피
type TtiKind  = 'hong' | 'cheong' | 'cho' | null  // 홍단 · 청단 · 초단

interface HwatuCard {
  id: string          // 안정 식별자. 예: '03-gwang', '09-pi-1'
  month: Month
  kind: CardKind
  tti: TtiKind        // kind === 'tti' 일 때만 의미
  piValue: 0 | 1 | 2  // 피 환산값. 쌍피 = 2
  isGodori: boolean   // 고도리 대상 (2·4·8월 새)
  seotda: boolean     // 섯다 20장 덱 포함 여부
  label: string       // 표시용 한국어 이름
}
```

`id`를 문자열 안정 키로 두는 이유: vision 인식 결과·DB `jsonb`·UI 선택 상태가 모두 같은 키를
쓰게 해서 변환 계층을 없애기 위해서다.

### 광 · 고도리 · 단 기준

| 분류 | 해당 월 |
|------|---------|
| 광 (5장) | 1월(송학), 3월(벚꽃), 8월(공산), 11월(오동), 12월(비) |
| 고도리 (3장) | 2월(매조), 4월(흑싸리 새), 8월(공산 기러기) |
| 홍단 | 1월, 2월, 3월 |
| 청단 | 6월, 9월, 10월 |
| 초단 | 4월, 5월, 7월 |

> 12월 비광은 룰에 따라 3광 계산에서 제외되거나 감점 처리된다. 아래 룰 토글 참조.

---

## 섯다 엔진

두 장으로 승부. `C(20,2) = 190`가지 조합 전부가 판정 대상이며, 이 190조합 전수를 테스트로 고정한다.

### 족보 서열 (높은 순)

```
[특수 상위]  38광땡 > 18광땡 > 13광땡
[땡]         장땡(10) > 9땡 > 8땡 > 7땡 > 6땡 > 5땡 > 4땡 > 3땡 > 2땡 > 1땡
[특수 하위]  알리(1·2) > 독사(1·4) > 구삥(1·9) > 장삥(1·10) > 장사(4·10) > 세륙(4·6)
[끗]         갑오(9끗) > 8끗 > 7끗 ... > 1끗 > 망통(0끗)
```

- **땡** = 같은 월 2장.
- **끗** = 두 장 월 합의 일의 자리. 9가 최상(갑오), 0이 최하(망통).
- 같은 족보끼리 맞붙으면 **무승부(비김)** 처리 후 룰 프리셋에 따라 재경기 또는 선(先) 우선.

### 특수 판정패 (룰 토글)

| 패 | 조합 | 효과 | 기본값 |
|----|------|------|--------|
| 암행어사 | 4·7 | 광땡을 잡는다 | on |
| 땡잡이 | 3·7 | 땡을 잡는다 (광땡 제외) | on |
| 구사 | 4·9 | 판 무효 → 재경기 | on |
| 멍텅구리구사 | 4·9 (선일 때) | 무조건 재경기 | off |

이 패들은 **서열 비교가 아니라 상대 의존적 판정**이다. 따라서 엔진은 두 단계로 나뉜다.

```ts
// 1단계: 손패 자체의 절대 등급
evaluateSeotdaHand(cards: [HwatuCard, HwatuCard]): SeotdaHand

// 2단계: 손패들 간 상대 판정 (암행어사·땡잡이·구사 반영)
resolveSeotdaShowdown(hands: SeotdaHand[], rules: SeotdaRules): SeotdaOutcome
```

1단계만으로 족보 Advisor가 동작한다(내 패가 뭔지 알려주는 것). 2단계는 판 결과 확정에 쓴다.
이 분리가 없으면 Advisor가 상대 패를 알아야 하는 모순이 생긴다.

### 결과 타입

```ts
interface SeotdaHand {
  cards: [HwatuCard, HwatuCard]
  category: 'gwangttaeng' | 'ttaeng' | 'special' | 'kkeut'
  label: string     // '38광땡' | '장땡' | '독사' | '갑오' | '망통' ...
  rank: number      // 서열 정수. 클수록 강함. 비교는 이 값만 쓴다
  traits: Array<'amhaengeosa' | 'ttaengjabi' | 'gusa'>  // 상대 의존 판정 플래그
}
```

`rank`를 정수 하나로 좁히는 이유: UI·정렬·비교가 전부 이 값 하나로 끝나고, 서열 규칙 변경이
`rank` 산출 함수 한 곳으로 국소화된다.

---

## 고스톱 엔진

섯다와 달리 **점수 누적형**이라 "족보 판정"이 아니라 "획득 패 집합 → 점수" 계산이다.

### 점수 계산 파이프라인

```
획득 카드 집합 (플레이어별)
  → 분류 집계 (광 / 열끗 / 띠 / 피)
  → 기본 점수 산출
  → 조합 보너스 (고도리 · 홍단 · 청단 · 초단)
  → 고(Go) 가산 및 배수
  → 박(피박 · 광박 · 멍박) 배수
  → 선언 배수 (흔들기 · 폭탄)
  → 최종 점수
```

### 기본 점수표

| 분류 | 규칙 |
|------|------|
| 광 | 3광 = 3점, 4광 = 4점, 5광 = 15점. 비광 포함 3광 = 2점 |
| 열끗 | 5장 = 1점, 이후 1장당 +1 |
| 띠 | 5장 = 1점, 이후 1장당 +1 |
| 피 | 10장 = 1점, 이후 1장당 +1 (쌍피 = 2장 환산) |
| 고도리 | 2·4·8월 새 3장 = 5점 |
| 홍단 / 청단 / 초단 | 각 3장 = 3점 |

### 배수 · 특수

| 항목 | 효과 |
|------|------|
| 1고 / 2고 | +1점 / +2점 |
| 3고 이상 | 고당 점수 ×2 누적 |
| 피박 | 패자 피 환산 5장 이하 → ×2 |
| 광박 | 패자 광 0장 & 승자 광점수 획득 → ×2 |
| 흔들기 / 폭탄 | 각 ×2 |
| 총통 | 같은 월 4장 보유 → 즉시 승리 |

### 룰 프리셋

지역 편차가 크다. **엔진은 값을 직접 알지 않고 프리셋을 받는다.**

```ts
interface GostopRules {
  goBonusFlat: number[]        // [1, 2]  1고·2고 가산점
  goMultiplierFrom: number     // 3       이 고 수부터 배수 적용
  bipiCountsAsGwang: boolean   // 비광 3광 인정 여부
  piBak: boolean
  gwangBak: boolean
  meongBak: boolean
  chongtongInstantWin: boolean
  shakeMultiplier: number      // 흔들기 배수
  bombMultiplier: number       // 폭탄 배수
  baseWinScore: number         // 나기 최소 점수 (보통 3)
}
```

기본 프리셋 `RULES_STANDARD`를 제공하고, 방 생성 시 토글로 덮어쓴다.
프리셋 자체는 `rooms.rule_preset` jsonb에 그대로 저장한다 (`02-data-model.md`).

### 결과 타입

```ts
interface GostopScore {
  breakdown: Array<{ source: string; points: number }>  // '광3', '고도리', '피11' ...
  base: number
  multipliers: Array<{ source: string; factor: number }>
  total: number
  canStop: boolean     // baseWinScore 이상인가
}
```

`breakdown`을 남기는 이유: 고스톱 분쟁의 90%는 "왜 그 점수냐"이다. 총점만 주면 앱이 심판 역할을
못 한다. UI는 이 배열을 그대로 펼쳐 보여준다.

---

## 엔진 계약 (공통)

```ts
interface GameEngine<Hand, Rules, Result> {
  readonly gameType: 'seotda' | 'gostop'
  readonly deck: readonly HwatuCard[]
  evaluate(cards: HwatuCard[], rules: Rules): Hand
  resolve(hands: Hand[], rules: Rules): Result
  describe(hand: Hand): string        // 사람이 읽는 설명. Advisor UI 표시용
}
```

새 게임 추가는 이 인터페이스 구현체를 `features/<game>/`에 넣는 것으로 끝난다.
`game_type` 문자열 → 엔진 매핑은 레지스트리 한 곳에서만 한다.

## 테스트 전략

| 대상 | 방식 | 기준 |
|------|------|------|
| 섯다 족보 | 190조합 전수 테이블 대조 | 100% 일치 |
| 섯다 상대 판정 | 암행어사·땡잡이·구사 시나리오 케이스 | 각 룰 on/off 양쪽 |
| 고스톱 기본 점수 | 분류별 경계값 (4장/5장/9장/10장) | 경계 오차 0 |
| 고스톱 배수 | 고 1·2·3·4, 피박·광박 조합 | 순서 의존성 검증 |
| 룰 프리셋 | 토글별 스냅샷 | 프리셋 변경이 다른 규칙을 오염시키지 않음 |

섯다 190조합은 사람이 만든 기대값 테이블(`seotda.fixtures.ts`)을 소스로 삼는다.
**엔진 출력으로 기대값을 생성하지 않는다** — 그러면 버그가 그대로 고정된다.

## Open Questions

- [ ] 섯다 무승부 처리 기본값: 재경기 vs 선 우선. 프리셋 기본값 확정 필요.
- [ ] 고스톱을 실물로 치는 이상, 앱이 획득 패 전체를 입력받는 것은 부담이 크다.
      "최종 점수만 입력" 간이 모드와 "패 입력 후 자동 계산" 정밀 모드 중 기본값 결정 필요
      → `08-ui-ux.md`와 연동.
- [ ] 위 점수표·서열은 통용 룰 기준이다. 구현 전 실제 플레이 그룹의 룰과 1회 대조할 것.
