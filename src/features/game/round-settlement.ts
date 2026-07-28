export function winnerPayout(existingPot: number, scoreSettlement: number = 0): number {
  return existingPot + scoreSettlement
}