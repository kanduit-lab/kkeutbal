// Barrel re-export for the ranking data-access surface. Split by aggregation
// target — single-room results vs. global cumulative ranking vs. per-player
// detail — so each concern stays in its own file. Import paths for consumers
// (`@/features/ranking/queries`) are preserved on purpose; add new query
// functions to the owning file below, not here.

export { getSessionStandings, getRoundHistory } from './room-results'
export type { StandingRow, RoundHistoryRow } from './room-results'

export { getCumulativeRanking } from './cumulative-ranking'
export type { CumulativeRow, CumulativeRankingFilter } from './cumulative-ranking'

export { getPlayerProfile, getPlayerStats, getPlayerRecentSessions } from './player-stats'
export type { PlayerProfile, PlayerGameStats, PlayerStats, PlayerRecentSession } from './player-stats'
