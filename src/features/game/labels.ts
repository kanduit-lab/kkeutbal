import type { RoomGameType } from './types'

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