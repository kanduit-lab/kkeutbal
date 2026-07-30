import type { Dictionary } from '@/lib/i18n/client'
import { raisePresets } from './shared'

/**
 * `ActionBar`의 레이즈 프리셋 버튼 금액 계산. `shared.ts`의 `raisePresets`(게임별 삥/따당/하프/풀
 * 같은 "라벨-원시 금액" 후보 목록)를 그대로 재사용하고, 여기서는 그 위에 액션바 전용 규칙만
 * 얹는다 — `raisePresets` 자체를 다시 구현하지 않는다.
 *
 * 원본(action-bar.tsx)의 `presets` useMemo와 동일한 순서로 적용한다:
 * 1. 직전 최고 베팅액(lastBet)보다 큰 후보만 남긴다.
 * 2. 이미 낸 금액(contribution)만큼 빼서 "추가로 내야 할 금액"으로 바꾼다.
 * 3. 최소 레이즈(minRaise) 미만은 버린다.
 * 4. 잔액이 남아있으면 올인 옵션을 추가한다.
 */
export interface RaisePresetInputs {
  readonly lastBet: number
  readonly pot: number
  readonly base: number
  readonly contribution: number
  readonly minRaise: number
  readonly balance: number
}

export function buildRaisePresetOptions(
  gameType: 'seotda' | 'poker',
  inputs: RaisePresetInputs,
  allinLabel: string,
  presetLabels?: Dictionary['presets'],
): readonly { label: string; amount: number }[] {
  const { lastBet, pot, base, contribution, minRaise, balance } = inputs

  const standard = raisePresets(gameType, { lastBet, pot, base }, presetLabels)
    .filter((preset) => preset.amount > lastBet)
    .map((preset) => ({ ...preset, amount: preset.amount - contribution }))
    .filter((preset) => preset.amount >= minRaise)

  return balance > 0 ? [...standard, { label: allinLabel, amount: balance }] : standard
}
