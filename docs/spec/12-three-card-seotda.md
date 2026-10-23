# 3장 섯다

| Field | Value |
|-------|-------|
| Type | technical-design |
| Audience | maintainers / reviewers |
| Status | active — 코드 구현됨. DB migration `0024`는 대상 DB에 아직 적용하지 않았다 |
| Source of truth | this document |
| Last reviewed | 2026-10-23 |

## Requirement

섯다 방은 2장 섯다와 3장 섯다 중 하나로 진행된다. 3장 섯다에서 각 참가자는 2장을 받아 1차 베팅을
하고, 3번째 장을 받아 2차 베팅을 한 뒤, 세 장 중 승부에 쓸 두 장을 직접 고른다. 판정 규칙은 고른
두 장에 2장 섯다 족보를 그대로 적용한다.

2장 방의 동작은 바뀌지 않는다.

## Contract

### 방 설정

- `rule_preset.seotdaCards`: `2 | 3`. 없으면 `2`다.
- 섯다 방에서만 의미가 있다. 고스톱 방은 이 키를 갖지 않는다.
- 첫 판이 생긴 뒤에는 바꿀 수 없다. `fair_play`와 같은 잠금을 쓴다.
- `seotdaCards = 3`이면 `maxMembers` 상한은 6이다. 덱 20장을 참가자당 3장씩 나누기 때문이다.
  2장 방의 상한 10은 그대로다.
- 방 만들기와 방 설정 화면이 이 값을 고른다.

### 판 단계

`rounds`에 두 컬럼을 더한다.

| 컬럼 | 타입 | 제약 |
|------|------|------|
| `street` | smallint | not null, default 1, `street in (1, 2)` |
| `choose_deadline` | timestamptz | null. 3장 방의 선택 단계에서만 값이 있다 |

`bet_actions`에 `street smallint not null default 1, street in (1, 2)`를 더한다. 액션은 기록 당시의
`rounds.street`를 그대로 받는다.

3장 방의 `playing` 판은 다음 순서로만 움직인다.

```text
street 1 베팅 ──showdown_ready──▶ street 2 베팅 ──showdown_ready──▶ 선택 단계 ──▶ 정산
      │                                │
      └──single_survivor──▶ 정산 ◀──────┘
```

- **street 1 → 2**: 1차 베팅이 `showdown_ready`가 되면 정산하지 않고 `street = 2`로 올린다.
  `single_survivor`는 지금처럼 바로 정산한다.
- **2차 베팅 완료**: 남은 참가자 전원이 street 2 액션을 하나 이상 가졌고, 각자의 누적 기여액이
  `currentToCall`과 같거나 올인 상태일 때다. 체크도 액션으로 센다. 콜 금액은 1차 베팅의 누적액을
  그대로 이어받는다.
- 남은 참가자 중 올인이 아닌 사람이 한 명 이하면 2차 베팅을 건너뛰고 바로 다음 단계로 간다.
- 차례 순서는 street마다 선부터 다시 돈다. street 1의 액션은 street 2 차례 계산에 쓰지 않는다.
  폴드·올인은 street 1의 것도 그대로 효력이 있다.
- 딜러의 판 종료와 판 무효는 어느 단계에서든 동작한다. 검증 딜 방에서 street 1 중에 판을 끝내면
  앞 두 장으로 판정한다.
- street가 올라간 뒤에는 앞 단계 액션을 정정할 수 없다. 선택 단계에 들어간 뒤에도 정정할 수 없다.
  둘 다 `errors.revertAfterStreetAdvanced`다.

### 카드 딜

검증 딜 방에만 해당한다. 수동 딜 방은 서버가 카드를 모르므로 이 절이 걸리지 않는다.

- 3장 방의 공개 영수증 `game`은 `seotda3`이고 딜 규칙은 `privateCardsPerParticipant: 3`,
  `publicBoardStages: []`다. 영수증 버전은 2장 방과 같다. 봉인할 때는 방의 `seotdaCards`로,
  다시 계산할 때는 영수증의 `game`으로 카드 수를 정한다.
- 참가자 i의 카드는 셔플된 덱의 `[3i, 3i+1, 3i+2]`다. 2장 방의 `[2i, 2i+1]` 배치는 바뀌지 않는다.
- 내 패 조회는 `street = 1`이면 앞 두 장만, `street = 2` 이후면 세 장을 돌려준다. 3번째 장은
  street 2가 되기 전에 어떤 응답에도 실리지 않는다.
- 3장 방의 검증 딜 참가 상한은 6명이다.

### 두 장 선택

검증 딜 방에만 해당한다. 수동 딜 방은 2차 베팅이 끝나면 지금처럼 딜러가 승자를 확정한다.

- 2차 베팅이 끝나면 `choose_deadline = now() + 60초`를 기록하고 선택 단계에 들어간다.
- 새 테이블 `round_hand_choices`:

| 컬럼 | 타입 | 제약 |
|------|------|------|
| `round_id` | uuid | PK, `round_participants` 복합 FK |
| `user_id` | uuid | PK, `round_participants` 복합 FK |
| `card_ids` | text[] | 길이 2, 서로 다름, 그 참가자의 세 장 안에 있어야 한다 |
| `chosen_at` | timestamptz | not null |

- 선택은 `submitHandChoice` 서버 액션 하나로 하고 한 번만 할 수 있다. 같은 참가자의 두 번째
  제출은 `errors.handChoiceAlreadySubmitted`, 손패 밖 카드는 `errors.handChoiceInvalid`,
  선택 단계가 아니거나 마감이 지났으면 `errors.handChoiceClosed`다.
- 폴드한 참가자는 선택하지 않는다.
- 남은 참가자 전원이 선택했거나 `choose_deadline`이 지나면 승부를 판정한다. 선택하지 않은
  참가자는 세 장에서 나오는 세 조합 중 `rank`가 가장 높은 쌍으로 판정한다.
- 판정은 고른 쌍들로 `resolveSeotdaShowdown`을 부른다. 구사·땡잡이·암행어사 trait도 고른 쌍
  기준이다. 세 장 안에 해당 월이 있어도 고르지 않았으면 성립하지 않는다.
- 구사로 재경기가 되면 지금 2장 방의 재경기와 같은 경로를 탄다.
- 마감 처리는 별도 스케줄러 없이 `settleDueHandChoices`가 한다. 방에 있는 클라이언트가 마감
  시각에 이 액션을 부르고, 마감 전이거나 선택 단계가 아니면 아무것도 하지 않는다.

### 섯다 엔진

- `evaluateSeotdaHand`는 지금처럼 두 장만 받는다.
- `bestSeotdaPair(cards)`: 세 장을 받아 세 쌍 중 `rank`가 가장 높은 쌍을 돌려준다. 동률이면
  손패 순서상 앞선 쌍을 고른다.
- `seotdaPairsOf(cards)`: 세 장의 세 쌍을 `[0,1]`, `[0,2]`, `[1,2]` 순서로 평가해 돌려준다.
  판독기와 선택 화면이 쓴다.
- `chosenSeotdaPair(cards, ids)`: 고른 두 장이 손패 안의 서로 다른 두 장이면 그 쌍을, 아니면
  null을 돌려준다.

### 실시간

- 방 스냅샷의 현재 판에 `street`, `chooseDeadline`, 이미 고른 참가자 ID인 `choiceUserIds`를
  싣는다. 고른 카드는 싣지 않는다. 방 정보에는 `seotdaCards`를 싣는다.
- 새 이벤트는 없다. 단계 전환과 선택은 액션을 실행한 클라이언트가 보내는 `state.snapshot`으로
  다른 클라이언트가 다시 받아 오고, 판이 끝나면 `round.ended`를 보낸다.

### 화면

- 내 패 패널은 3장 방에서 세 칸을 그린다. 3번째 칸은 street 2 전까지 잠긴 상태로 보인다.
- 선택 단계에서는 세 쌍을 족보 이름과 함께 보여 주고 하나를 고르게 한다. 남은 시간을 표시한다.
- 차례 표시와 액션 바는 2차 베팅 중임을 보여 준다.
- 족보 판독기는 2장 또는 3장을 고를 수 있다. 3장이면 세 쌍과 최고 쌍을 보여 준다.

## Boundary

- 족보 서열과 특수 판정패 → `04-game-engines.md`
- 검증 딜의 셔플·commitment·영수증 형식 → `10-virtual-credit-and-fair-play.md`
- 테이블·컬럼 전체 목록과 권한 → `02-data-model.md`
- 스냅샷과 이벤트 전송 → `03-realtime-protocol.md`
- 마이그레이션 적용 절차 → `runbooks/01-database-migrations.md`
