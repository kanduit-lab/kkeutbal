import { addSafeChipIntegers } from './chip-integers'

/**
 * 승자가 실제로 받는 금액. 판에 걸린 판돈에 고스톱 점수 정산으로 걷은 몫을 더한다.
 *
 * 두 값 다 개별로는 안전 정수라도 합이 범위를 넘을 수 있어서 그냥 `+`로 두지 않는다.
 * 여기서 안 막으면 정밀도를 잃은 값이 `chip_ledger.delta`까지 내려가고, DB의 per-row
 * check가 잡아주긴 하지만 원인을 알 수 없는 `endRoundFailed`로만 보인다.
 */
export function winnerPayout(existingPot: number, scoreSettlement: number = 0): number {
  return addSafeChipIntegers(existingPot, scoreSettlement, 'Winner payout')
}
