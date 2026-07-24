# 게임 엔진 — 화투 · 섯다 · 고스톱

| Field | Value |
|-------|-------|
| Type | technical-design |
| Audience | engineering / QA |
| Status | active |
| Source of truth | this document (카드 모델·족보 규칙) + 구현 코드 (계산 순서·경계값) |
| Last reviewed | 2026-07-24 |

구현: `src/features/hwatu/`, `src/features/seotda/`, `src/features/gostop/`, `src/features/poker/`.
섯다·고스톱·포커 순수 엔진 테스트는 각 기능 폴더의 `*.test.ts`에 있으며, 섯다는 20장 중
2장을 뽑는 190조합을 독립 규칙 분기로 전수 대조한다.

## 설계 원칙

1. **엔진은 순수 함수다.** 입력은 카드 배열과 룰 프리셋, 출력은 판정 결과. I/O·DB·시간·난수 금지.
2. **지역 룰은 데이터로 뺀다.** 룰은 `rule_preset` jsonb로 방에 저장되고 엔진에 인자로 들어간다.
3. **카드 모델은 게임군마다 하나다.** 섯다와 고스톱은 같은 화투 48장(`hwatu`)을 쓴다. 포커는
   화투와 무관한 트럼프 52장 모델(`poker/cards.ts`)을 별도로 쓴다 — `poker`는 `hwatu`에
   의존하지 않는다.

## 화투 카드 모델

48장 = 12개월 × 4장. `src/features/hwatu/cards.ts`가 월별 스펙(`MONTH_SPECS`)에서 덱을 파생시킨다
(48줄 수기 나열 대신 스펙 선언 → `buildDeck()`).

```ts
// src/features/hwatu/types.ts
type Month = 1|2|3|4|5|6|7|8|9|10|11|12
type CardKind = 'gwang' | 'yeol' | 'tti' | 'pi'
type TtiKind  = 'hong' | 'cheong' | 'cho' | null   // null = 어떤 단에도 안 속함 (12월 비띠)

interface HwatuCard {
  readonly id: string          // '{MM}-{kind}[-{n}]'. 예: '03-gwang', '01-pi-1'
  readonly month: Month
  readonly kind: CardKind
  readonly tti: TtiKind        // kind !== 'tti' 면 항상 null
  readonly piValue: 0 | 1 | 2  // 쌍피 = 2
  readonly isGodori: boolean
  readonly seotda: boolean     // 섯다 20장 덱 포함 여부 = month <= 10 && kind !== 'pi'
  readonly label: string
}

type CardId = HwatuCard['id']
type GameType = 'seotda' | 'gostop'
```

`id` 접미사 규칙: 같은 월·같은 kind가 2장 이상이면(피) `-1`/`-2`를 붙이고, 1장뿐이면 접미사 없음.
`findCard(id)`가 vision 인식 결과·DB jsonb·UI 선택 상태를 이 문자열 키로 정규화하는 유일한 관문이다.
`deckFor(gameType)`이 `'seotda'` → `SEOTDA_DECK`(20장), `'gostop'` → `HWATU_DECK`(48장)을 반환한다.

### 광 · 고도리 · 단 기준

| 분류 | 해당 월 | 코드 상수 |
|------|---------|-----------|
| 광 (5장) | 1월(송학), 3월(벚꽃), 8월(공산), 11월(오동), 12월(비) | `MONTH_SPECS` kind:'gwang' |
| 고도리 (3장) | 2월(매조 새), 4월(흑싸리 새), 8월(공산 기러기) | `godori: true` |
| 홍단 | 1월, 2월, 3월 | `tti: 'hong'` |
| 청단 | 6월, 9월, 10월 | `tti: 'cheong'` |
| 초단 | 4월, 5월, 7월 | `tti: 'cho'` |
| 12월 비띠 | 어떤 단에도 속하지 않음 | `tti: null` |
| 쌍피 | 11월 오동 피 1장, 12월 비 피 1장 | `piValue: 2` |
| 9월 국진(술잔) | 기본은 열끗(`kind: 'yeol'`). `gukjinAsSsangpi` 룰로 쌍피 전환 가능 | id `09-yeol`, 고스톱 엔진 참조 |

섯다 덱(`SEOTDA_DECK`, 20장)은 1~10월의 비(非)피 카드다. 각 월마다 정확히 2장(광/열끗/새 1장 +
띠 1장, 광이 없는 월은 열끗+띠)이 포함되므로 10월 × 2장 = 20장. 11·12월 광은 섯다 판정에 등장하지
않는다 — 섯다의 광땡 조합이 13/18/38 세 가지뿐인 이유가 여기서 나온다.

---

## 섯다 엔진 (`src/features/seotda/`)

두 장으로 승부. `C(20,2) = 190`가지 카드 조합 전부가 판정 대상이다.

### 족보 서열 (높은 순, `SEOTDA_RANK`)

```
[광땡]   38광땡(1000) > 18광땡(990) > 13광땡(980)
[땡]     장땡=10월(900) > 9땡(890) > ... > 1땡(810)     — TTAENG_BASE(800) + month*10
[특수]   알리 1·2(760) > 독사 1·4(750) > 구삥 1·9(740)
         > 장삥 1·10(730) > 장사 4·10(720) > 세륙 4·6(710)
[끗]     갑오=9끗(609) > 8끗 > ... > 1끗(601) > 망통=0끗(600)  — KKEUT_BASE(600) + kkeut
```

- **땡** = 같은 월 2장. 섯다 덱은 월당 2장뿐이므로 각 월에 땡 조합이 정확히 1개씩, 총 10개.
- **끗** = 두 장 월 합의 일의 자리. `(a.month + b.month) % 10`.
- **비교는 오직 `rank` 정수 하나로만 한다** (`SeotdaHand.rank`). 서열 규칙 변경은 `SEOTDA_RANK`와
  등급 산출 함수(`gradeHand`) 한 곳으로 국소화된다.
- 구간 사이 여백(예: 특수 710~760, 땡 810~900)은 향후 룰 추가 시 재계산을 피하기 위한 것으로,
  값 자체엔 의미가 없고 대소 관계만 계약이다.

### 190조합 분포 (`seotda/engine.test.ts`가 이 값을 기준으로 검증)

| 카테고리 | 조합 수 | 근거 |
|----------|---------|------|
| 광땡 | 3 | 섯다 덱의 광은 1·3·8월 각 1장 — `C(3,2)`. 13/18/38광땡 외 도달 불가 (덱 구성이 바뀌면 `gradeGwangttaeng`이 예외를 던진다) |
| 땡 | 10 | 월당 2장이므로 월당 정확히 1개 |
| 특수 (알리·독사·구삥·장삥·장사·세륙) | 24 | 특수 월-쌍 6개 × 카드 조합 4개(각 월 2장 중 선택) |
| 끗 | 153 | 190 − 3 − 10 − 24. 갑오·망통 포함 |

**주의**: 특수 판정패(암행어사·땡잡이·구사) 트리거 월-쌍(4·7, 3·7, 4·9)은 위 4개 카테고리 중 어디에도
속하지 않는 별도 축이다. 이 월-쌍의 카드 조합은 실제로는 "끗" 카테고리로 채점되고(예: 4·7 →
1끗, 3·7 → 망통, 4·9 → 3끗), `traits` 배열에 잡기/재경기 플래그만 얹힌다. 즉 153개 끗 조합 중
일부가 트리거를 겸한다 — 카테고리 수와 트리거 수는 서로 다른 축이라 합산하지 않는다.

### 특수 판정패 (상대 의존, 룰 토글)

| 패 | 월-쌍 | 조건 | 효과 | 기본값 |
|----|------|------|------|--------|
| 암행어사 | 4·7 | **두 장 모두 `kind === 'yeol'`일 때만** | 최고 족보가 광땡이면 잡는다 | on |
| 땡잡이 | 3·7 | 월-쌍만 (kind 무관) | 최고 족보가 땡이면 잡는다 (광땡 불가) | on |
| 구사 | 4·9 | 월-쌍만 (kind 무관) | 판 보유 즉시 무효 → 재경기 | on |

암행어사만 카드 종류 제약이 있다: 4월엔 열끗(흑싸리 새)과 초단 띠가 있고 7월엔 열끗(홍싸리
멧돼지)과 초단 띠가 있는데, 두 장이 정확히 "열끗+열끗"일 때만 암행어사가 성립한다 — 4·7 조합 4개
카드쌍 중 1개만 해당. 문서 구버전의 "월 조합만으로 판정"은 코드와 다르다; 이 표가 정본이다.

옛 문서에 있던 **멍텅구리구사**(선일 때 무조건 재경기)는 **구현되지 않았다**. `SeotdaRules`에
별도 필드가 없고, `gusa` 토글 하나만 존재한다.

### 승부 판정 순서 (`resolveSeotdaShowdown`)

```ts
evaluateSeotdaHand(cards: [HwatuCard, HwatuCard]): SeotdaHand        // 1단계: 절대 등급
resolveSeotdaShowdown(hands: SeotdaHand[], rules: SeotdaRules): SeotdaOutcome  // 2단계: 상대 판정
```

1단계만으로 족보 Advisor가 동작한다. 2단계는 판 결과 확정에 쓴다. 분리하지 않으면 Advisor가
상대 패를 알아야 하는 모순이 생긴다.

`resolveSeotdaShowdown`는 참가자 순서 배열(`index 0 = 선`)을 받아 다음 순서로 처리한다:

1. **구사** — `rules.gusa`가 켜져 있고 누구든 `traits`에 `'gusa'`가 있으면 즉시 `{ kind: 'replay' }`.
2. **최고 족보 탐색** — `rank`가 가장 높은 손패(들)를 찾는다(`strongestOf`, 동률이면 여러 개).
3. **잡기** — 최고 족보의 카테고리가 `gwangttaeng`이고 `rules.amhaengeosa`가 켜져 있으면
   `'amhaengeosa'` trait 보유자를, `ttaeng`이고 `rules.ttaengjabi`가 켜져 있으면 `'ttaengjabi'`
   trait 보유자를 찾는다. **찾으면 그 손패가 판 전체를 가져간다** — 원래 최고 족보였던 손패는
   진다. 잡기 후보가 여럿(동급)이면 `breakTie`.
4. **순수 rank 비교** — 잡기가 없으면 최고 rank 손패가 승리. 동률이면 `breakTie`.

`breakTie(tied, context, rules)`: `rules.tieBreak === 'dealer-wins'`면 참가 배열에서 **index가
가장 낮은(선에 가장 가까운) 손패**가 승리. `'replay'`(기본값)면 재경기.

```ts
interface SeotdaRules {
  amhaengeosa: boolean
  ttaengjabi: boolean
  gusa: boolean
  tieBreak: 'replay' | 'dealer-wins'
}
// SEOTDA_RULES_STANDARD = { amhaengeosa: true, ttaengjabi: true, gusa: true, tieBreak: 'replay' }
```

`SeotdaHand.rank`가 정수 하나로 좁혀져 있어 UI·정렬·비교가 이 값 하나로 끝난다.
`describeSeotdaHand(hand)`가 Advisor UI에 노출되는 설명 문자열(카드 쌍 + 족보명 + trait 메모)을
만든다.

---

## 고스톱 엔진 (`src/features/gostop/`)

섯다와 달리 **점수 누적형** — 족보 판정이 아니라 "획득 패 집합 → 점수" 계산이다. 계산은 두
함수로 나뉜다.

```ts
captureOf(cards: HwatuCard[], rules: GostopRules): GostopCapture   // 분류 집계
scoreGostop(capture: GostopCapture, context: GostopContext, rules: GostopRules): GostopScore
```

`GostopContext`(고 횟수·흔들기 횟수·폭탄 횟수·상대 집계)가 별도인 이유: 획득 패만으로는 배수를
계산할 수 없다(피박·광박은 상대 집계가 필요하고, 고 배수는 판 진행 상태가 필요하다).

### 계산 파이프라인

```
분류 집계(captureOf) → 기본 점수 + 조합 보너스(baseLines) → 고 가산 라인 → 배수(고 → 박 → 선언) → 총점
```

```ts
// scoreGostop 핵심 계약
base = sum(baseLines(capture, rules))          // 카드 점수만. 고 가산 제외
canStop = base >= rules.baseWinScore           // 카드 점수만으로 판정 — 고 가산이 섞이면 오염됨
additive = base + (고 가산 라인 있으면 그 점수)
total = additive * (모든 multiplier.factor 곱)
```

`breakdown`은 `baseLines` 결과 + 고 가산 라인, `multipliers`는 고 배수 → 박 배수 → 선언 배수
순서로 채워진다(값은 곱셈이라 순서 무관이지만 UI 표시 순서는 이 배열 순서를 따른다). 총점만
주면 "왜 그 점수냐" 분쟁에 앱이 답을 못 하므로 두 배열을 그대로 UI에 펼친다.

### 기본 점수 (`baseLines`, 경계값은 코드 상수)

| 분류 | 규칙 | 코드 상수 |
|------|------|-----------|
| 광 | 5장=15점, 4장=4점, 3장=3점(비광 포함 & `!bipiCountsAsGwang`이면 2점) | `GWANG_MIN=3` |
| 열끗 | 5장=1점, 이후 1장당 +1 (`count - 4`) | `YEOL_MIN=5` |
| 띠 | 5장=1점, 이후 1장당 +1 (`count - 4`) | `TTI_MIN=5` |
| 피 | 피 환산 10=1점, 이후 1당 +1 (`piValue - 9`, 쌍피=2로 환산 후 합산) | `PI_MIN=10` |
| 고도리 | 고도리 대상 카드가 **정확히 3장**일 때만 +5 (3장 초과는 애초에 불가능) | `GODORI_SIZE=3` |
| 홍단/청단/초단 | 각 단이 **정확히 3장**일 때 +3 | `DAN_SIZE=3` |

`12-gwang`(비광)이 5광에 포함돼도 5광 점수(15점)는 그대로다 — `bipiCountsAsGwang`은 3광에만
영향을 준다(코드상 4·5광 분기에는 이 토글이 관여하지 않는다).

### 국진(9월) 쌍피 배치 규칙

`gukjinAsSsangpi`가 켜져 있고 국진(`09-yeol`)을 획득했으면, **열끗으로 뒀을 때의 기본 점수 합**과
**쌍피로 뒀을 때의 기본 점수 합**을 각각 `baseLines`로 계산해 **더 높은 쪽을 채택**한다. 동점이면
쌍피를 택한다(`piScore >= yeolScore`). 판단 대상은 광/열끗/띠/피/고도리/단을 모두 반영한 총점이지,
단순히 "피가 부족하면 피로" 같은 국소 규칙이 아니다. 실제 플레이에서는 플레이어가 직접 선택하지만
이 함수는 판 상황을 모르므로 점수 최대화를 결정 규칙으로 쓴다.

### 배수

| 항목 | 조건 | 배수 |
|------|------|------|
| 고 배수 | `goCount >= goMultiplierFrom`(기본 3) | `2 ** (goCount - goMultiplierFrom + 1)` — 3고×2, 4고×4, 5고×8 |
| 피박 | 승자 피 환산 ≥10 **and** 상대 중 피 환산 ≤5(`PIBAK_MAX_PI`)가 있음 | ×2 |
| 광박 | 승자 광 ≥3 **and** 상대 중 광 0장이 있음 | ×2 |
| 멍박 | 승자 열끗 ≥5 **and** 상대 중 열끗 0장이 있음 (광박과 대칭 정의, 기본 off) | ×2 |
| 흔들기 | `shakeCount > 0` | `shakeMultiplier ** shakeCount` |
| 폭탄 | `bombCount > 0` | `bombMultiplier ** bombCount` |

**고 가산(`goBonusFlat`)은 배수 대상이 아니다.** `additive = base + goLine.points`를 먼저 만들고
그 뒤에 모든 multiplier를 곱한다 — 즉 고 가산점도 박·흔들기·폭탄 배수의 영향을 받는다(고
배수 자체의 대상은 `additive` 전체). `goBonusFlat`은 인덱스로 조회하며 `goCount`가 배열 길이를
넘으면 마지막 항목 값이 그대로 유지된다(기본 프리셋 `[1,2]`면 3고 이상도 가산은 +2 고정 —
고 배수가 증가분을 대신 처리한다).

**총통**(`hasChongtong`)은 같은 월 4장 보유 감지만 제공한다. `chongtongInstantWin` 토글의
즉시 승리 처리는 이 모듈이 소비하지 않는다 — 판 흐름(게임 상태머신, `features/game/`) 소관이며
현재 `features/game/`에 해당 로직은 구현돼 있지 않다.

### 룰 프리셋

```ts
interface GostopRules {
  goBonusFlat: readonly number[]        // 인덱스 0 = 1고
  goMultiplierFrom: number              // 기본 3
  bipiCountsAsGwang: boolean            // false 면 비광 포함 3광 = 2점
  piBak: boolean
  gwangBak: boolean
  meongBak: boolean                     // 기본 off
  chongtongInstantWin: boolean          // 이 모듈은 감지만 제공, 소비는 game 상태머신
  shakeMultiplier: number
  bombMultiplier: number
  baseWinScore: number                  // 나기 최소 점수 (canStop 판정 기준)
  gukjinAsSsangpi: boolean              // 9월 국진 쌍피 전환 허용
}

const GOSTOP_RULES_STANDARD = {
  goBonusFlat: [1, 2], goMultiplierFrom: 3, bipiCountsAsGwang: false,
  piBak: true, gwangBak: true, meongBak: false, chongtongInstantWin: true,
  shakeMultiplier: 2, bombMultiplier: 2, baseWinScore: 3, gukjinAsSsangpi: true,
}
```

프리셋은 `rooms.rule_preset` jsonb에 그대로 저장한다 (`02-data-model.md`).

### 결과 타입

```ts
interface GostopCapture {
  gwang: HwatuCard[]; yeol: HwatuCard[]; tti: HwatuCard[]; pi: HwatuCard[]
  piValue: number   // 쌍피 환산 합계
}

interface GostopScore {
  breakdown: Array<{ source: string; points: number }>   // '광3', '고도리', '피11', '2고' ...
  base: number             // 카드 점수만 (고 가산 제외)
  multipliers: Array<{ source: string; factor: number }>
  total: number
  canStop: boolean         // base >= rules.baseWinScore
}
```

### 점수 정산 (`endRound` — 액션 레이어, 엔진 밖)

간이 모드(딜러가 최종 점수만 입력)의 칩 정산은 `src/features/game/round-actions.ts`의
`endRound`가 수행한다. 패자별 지불액 공식:

```
지불 = score × pointValue × factor        (factor: 1 | 2 | 4, 기본 1)
```

- `factor`는 **패자별** 박 배수다 — 실전 고스톱에서 피박·광박은 패자 개인에게 붙는다.
  2 = 피박 또는 광박, 4 = 둘 다. `endRound` 입력의 `loserPenalties: { userId, factor }[]`
  (최대 9명)로 전달되고, 목록에 없는 패자는 1배
- 고 가산·고 배수·흔들기·폭탄 같은 **승자 공통 계산은 딜러 UI가 score에 미리 반영해서** 보낸다 —
  액션은 받은 score를 그대로 쓴다. 총통은 배수가 아니라 즉시 승리 규칙이라 이 입력에 포함하지 않는다
- 잔액 상한(올인)은 배수 적용 뒤의 지불액에 적용된다 — 원장 음수 금지 불변식 유지
- `loserPenalties`의 userId가 이번 판 참가자이자 실제 패자가 아니면 판 종료 전체가 실패한다.
  중도 퇴장해도 `round_participants`에 남으므로 정산 대상에서 빠지지 않는다
- **경계**: `gostop/scoring.ts` 순수 엔진은 이 정산에 관여하지 않는다(변경 없음).
  `scoreGostop`의 multipliers는 점수 계산·Advisor 표시용이고, 칩 정산의 factor 적용은
  액션 레이어 소관이다

---

## 포커 엔진 (`src/features/poker/`)

텍사스 홀덤 표준 규칙 기준, 5~7장 중 최선 5장으로 족보를 정하는 순수 함수 세트. 화투 카드
모델과 독립된 트럼프 52장 모델을 쓴다.

### 카드 모델 (`cards.ts`)

```ts
type PokerSuit = 's' | 'h' | 'd' | 'c'
interface PokerCard {
  readonly id: string    // '{랭크문자}{무늬대문자}'. 예: 'AS'(스페이드 A), 'TD'(다이아 10)
  readonly rank: number  // 2~14 (14 = A)
  readonly suit: PokerSuit
  readonly label: string // '♠A' 같은 표시용 문자열
}
```

`POKER_DECK`(52장) = 4무늬 × 13랭크(`buildDeck()`으로 파생, 화투 `buildDeck()`과 같은 패턴).
`findPokerCard(id)`가 id → 카드 정규화 유일 관문이다(`hwatu`의 `findCard`와 동형).

### 카테고리 서열 (`engine.ts` `CATEGORY_PRIORITY`, 높은 순)

```
로열 플러시(9) > 스트레이트 플러시(8) > 포카드(7) > 풀하우스(6) > 플러시(5)
> 스트레이트(4) > 트리플(3) > 투페어(2) > 원페어(1) > 하이카드(0)
```

`PokerHand.ranks`는 `[카테고리 우선순위, ...키커 내림차순]` 벡터다. 엔진은 이 벡터를
사전식(lexicographic)으로 비교한다 — 섯다의 `rank` 정수 한 값 비교와 달리 카테고리별
키커까지 벡터로 들고 다닌다(카테고리가 같을 때 키커 비교가 필요해서).

### 5~7장 → best-5 (`evaluatePokerHand`)

- 입력 정규화(`normalizeInput`): 5~7장, 카드 id 중복 금지, 표준 52장 덱에 없는 id 거부.
  랭크·무늬·라벨은 호출자 객체를 신뢰하지 않고 `findPokerCard(id)`의 정본으로 다시 계산한다.
- `combinationsOf5`가 입력 카드 중 5장을 고르는 모든 조합을 만든다(최대 `C(7,5)=21`개, 재귀
  백트래킹).
- 각 조합을 `evaluateFiveCards`로 채점하고 `compareRankVectors`로 최댓값을 고른다.
- 홀덤 실사용은 7장(개인 2 + 커뮤니티 5)이지만 함수 자체는 5~7장 어떤 입력이든 받는다 — 족보
  Advisor는 사용자가 고른 만큼(최대 7장)만 그대로 넘긴다.

### 카테고리 판정 순서 (`evaluateFiveCards`)

1. 플러시(같은 무늬 5장)와 스트레이트(연속 랭크 5장)가 동시에 성립하면 로열/스트레이트 플러시.
2. 랭크별 매수 분포(`shape`, 내림차순 정렬)로 포카드(4)/풀하우스(3+2)/트리플(3)/투페어(2+2)/
   원페어(2)를 분기한다.
3. 위 어디에도 안 걸리면 플러시 단독 → 스트레이트 단독 → 하이카드 순으로 확인한다(1번에서 이미
   플러시+스트레이트 동시 성립을 걸러냈으므로 이 순서에서 충돌하지 않는다).

### 스트레이트 판정 — 백스트레이트 포함 (`detectStraightHigh`)

- 유니크 랭크가 정확히 5개이고 내림차순으로 연속이면 그 최고 랭크가 스트레이트의 하이카드.
- **백스트레이트(A-2-3-4-5)**는 별도 분기로 검사한다: 정렬된 랭크가 정확히
  `[14, 5, 4, 3, 2]`면 하이카드를 `5`로 취급한다(텍사스 홀덤 표준 — 가장 낮은 스트레이트).
- 유니크 랭크가 5개가 아니면(페어 등으로 뭉치면) 스트레이트가 성립하지 않는다(`null`).

### 설명 문자열 (`describePokerHand`)

`describeGroupRanks`가 카테고리별 한국어 한 줄 설명(예: "풀하우스 — K 트리플 + 7 페어")을
만든다. 랭크 표기는 `T`(10)/`J`/`Q`/`K`/`A`.

---

## 족보 Advisor 통계 (`src/features/jokbo-advisor/stats.ts`)

Advisor 화면이 판정과 함께 보여주는 파생 통계. 섯다·고스톱·포커 엔진을 소비만 하고 새 판정
규칙을 추가하지 않는다.

### 섯다 (`seotdaStats`)

- 모듈 로드 시 1회, `SEOTDA_DECK`(20장)에서 나오는 `C(20,2)=190`조합 전부를 `evaluateSeotdaHand`로
  평가해 캐시한다(`ALL_SEOTDA_HANDS`). 이 190개의 `rank` 값 집합에서 중복을 제거하고 내림차순
  정렬한 것이 서열 단계 배열(`SEOTDA_TIERS`) — "전체 N단계 중 몇 위"의 근거다.
- `tierPosition` — 이 손패의 `rank`가 `SEOTDA_TIERS`에서 몇 번째(1 = 최강)인지.
- `sameTierCount` — 190조합 중 같은 `rank`를 가진 조합 수(동급 조합 수).
- `winRate`/`loseRate`/`replayRate` — 내 손패를 고정하고, 남은 18장에서 상대 1명이 받을 수 있는
  `C(18,2)=153`가지 조합 전부와 `resolveSeotdaShowdown`(암행어사·땡잡이·구사 포함, 표준 룰
  `SEOTDA_RULES_STANDARD`)으로 붙여 집계한 비율이다. `replay`(구사·동급 무승부)는 승패 어느
  쪽에도 넣지 않고 별도 비율로 뺀다.
- 렌더마다 153회 판정을 다시 도는 게 아니라 `advisor-client.tsx`의 `useMemo`가 손패가 바뀔
  때만 재계산한다.

### 포커 (`POKER_CATEGORY_STATS`)

- 계산이 아니라 **표준 5장 무작위 등장 확률표**를 상수로 박아 둔 값이다(52장 중 5장을 무작위로
  뽑을 때의 통용 확률 — `evaluatePokerHand`의 5~7장 입력을 시뮬레이션한 값이 아니다). 카테고리별로
  `position`(1~10, 로열 플러시가 1위)과 `probability`(%)를 갖는다.
- 홀덤처럼 7장 중 최선 5장을 고르는 실제 상황의 확률과는 다르다는 점을 UI 문구("5장 뽑아 나올
  확률")로 구분해 표시한다.

---

## 엔진 계약 (공통 인터페이스 — 미구현)

`GameEngine<Hand, Rules, Result>` 형태의 공통 인터페이스, `game_type` → 엔진 매핑 레지스트리는
여전히 코드에 없다. 섯다·고스톱·포커 세 모듈이 각자 독립적으로 함수를 export할 뿐이다. 포커까지
추가된 뒤에도 추상화가 필요해지지 않은 이유: `features/game/`은 판 종료 시 **어떤 엔진도 호출하지
않는다** — 승자 지정은 딜러가 수동으로 하고(`endRound`), 각 엔진은 족보 Advisor와 `/guide` 표시
용도로만 쓰인다. `rooms.game_type`은 DB 컬럼·UI 라벨 분기(`GAME_LABELS`) 용도이지 엔진 디스패치
키가 아니다. 판 결과를 엔진이 자동 계산하는 경로가 생기면 이 절을 설계로 다시 채운다.

## 테스트 전략

| 대상 | 방식 | 기준 | 상태 |
|------|------|------|------|
| 섯다 서열 상수 | `SEOTDA_RANK`/`SEOTDA_SPECIALS`/`SEOTDA_TRAIT_COMBOS` 구조 검증 | 구간 분리·중복 없음 | 구현됨 (`engine.test.ts`) |
| 섯다 족보 190조합 | 엔진과 독립된 규칙 분기로 전수 대조 | 100% 일치 | 구현됨 (`engine.test.ts`) |
| 섯다 상대 판정 | 암행어사·땡잡이·구사 시나리오 | 룰 on/off 및 위조 입력 방어 | 구현됨 (`engine.test.ts`) |
| 고스톱 기본 점수 | 분류·광·열끗·띠·피 경계값 | 경계 오차 0 | 구현됨 (`scoring.test.ts`) |
| 고스톱 배수 | 고·피박·흔들기·폭탄 조합 | 누적 순서·안전 정수 검증 | 구현됨 (`scoring.test.ts`) |
| 포커 카테고리 판정 | 10개 카테고리 + 백스트레이트(A-2-3-4-5) | 카테고리·서열 벡터 일치 | 구현됨 (`engine.test.ts`) |
| 포커 5~7장 best-5 | 대표 7장 시나리오에서 최강 조합 선택 | full-house·키커 일치 | 구현됨 (`engine.test.ts`) |
| Advisor 통계(`stats.ts`) | 섯다 190조합 tier 집합 크기·포커 확률표 합이 100%인지 | 구조 검증 | 미구현 |

섯다 190조합의 기대값은 `evaluateSeotdaHand` 출력으로 생성하지 않는다. 테스트 안에서 카드의
광 여부·동월 여부·특수 월 조합·끗 계산을 독립적으로 분기해 엔진 결과와 대조한다.

## Open Questions

- [ ] `chongtongInstantWin` 소비 위치 — `features/game/`에 즉시 승리 처리가 아직 없다. 상태머신
      설계 시 `hasChongtong` 호출 지점을 확정할 것.
- [x] 고스톱 입력 방식 확정(2026-07-23): "최종 점수만 입력" 간이 모드가 기본이다.
      판 종료 시 딜러가 점수를 입력하면 점수 × 점당 칩 × 패자별 박 배수를 패자 전원이
      지불한다(`endRound`, 위 "점수 정산" 절). 패 입력 후 자동 계산 정밀 모드는 미구현.
- [ ] 위 점수표·서열은 통용 룰 기준이다. 실제 플레이 그룹의 룰과 1회 대조할 것.
