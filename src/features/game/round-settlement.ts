/**
 * 이미 모인 베팅 팟과 고스톱 점수 정산액은 모두 승자에게 귀속된다.
 *
 * 고스톱도 공통 베팅을 사용할 수 있으므로 점수 정산액만 지급하면 기존 팟이 원장에
 * 남아 총 칩 수가 맞지 않게 된다.
 */
export function winnerPayout(existingPot: number, scoreSettlement: number = 0): number {
  return existingPot + scoreSettlement
}
