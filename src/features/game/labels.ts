import type { RoomGameType } from './types'

/**
 * 게임 종류별 표시용 이모지 — 방 목록·랭킹·가이드 등 앱 라우트에서 두루 쓰는 공용 상수.
 * 이름은 여기 두지 않는다. 사전(`d.games[type]`)이 정본이다 — 상수에 한국어 이름을 두면
 * 이걸 읽는 화면만 EN 로케일에서 한국어로 남는다.
 */
export const GAME_LABELS: Record<RoomGameType, { emoji: string }> = {
  seotda: { emoji: '🎴' },
  gostop: { emoji: '🌸' },
  poker: { emoji: '♠' },
}

export const GAME_BADGE_TONE: Record<RoomGameType, 'accent' | 'win' | 'warn'> = {
  seotda: 'accent',
  gostop: 'win',
  poker: 'warn',
}
