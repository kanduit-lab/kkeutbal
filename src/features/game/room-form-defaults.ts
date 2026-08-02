/**
 * 방 만들기·방 설정 두 화면이 함께 쓰는 금액 기본값과 스테퍼 눈금.
 *
 * 시작 칩과 삥(베팅 기본 단위)의 기본값은 **함께** 움직여야 한다. 서버의
 * `defaultBaseBet`(`action-helpers.ts`)이 이미 "삥 = 시작 칩 / 100"을 쓰고 있어서,
 * 삥 기본값만 100으로 올리면 시작 칩 기본값 100과 맞물려 **삥 한 번이 스택 전부**가 되는
 * 방이 만들어진다. 그래서 두 값을 같은 비율로 올린다.
 *
 * 눈금(step)은 1을 쓰지 않는다 — 1단위로는 이 금액대에 도달할 수 없다. 큰 이동은
 * 프리셋 버튼, 임의의 값은 스테퍼 숫자를 눌러 뜨는 직접 입력 다이얼로그가 담당하고,
 * 눌러 두면 `Stepper`의 가속이 폭을 키운다.
 */

export const CHIP_PRESETS = [5_000, 10_000, 20_000, 50_000] as const
export const CHIP_STEP = 100
export const DEFAULT_STARTING_CHIPS = 10_000

export const BASE_BET_PRESETS = [50, 100, 500, 1_000] as const
export const BASE_BET_STEP = 10
export const DEFAULT_BASE_BET = 100

/** 고스톱 점당 칩. 베팅이 없어 삥과 무관하지만 1단위 눈금이 불편한 것은 같다 */
export const POINT_VALUE_STEP = 10
