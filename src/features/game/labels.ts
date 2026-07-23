import type { RoomGameType } from './types'

/** 게임 종류별 표시용 이름·이모지 — 방 목록·랭킹·가이드 등 앱 라우트에서 두루 쓰는 공용 상수. */
export const GAME_LABELS: Record<RoomGameType, { name: string; emoji: string }> = {
  seotda: { name: '섯다', emoji: '🎴' },
  gostop: { name: '고스톱', emoji: '🌸' },
  poker: { name: '포커', emoji: '♠' },
}

export const GAME_BADGE_TONE: Record<RoomGameType, 'accent' | 'win' | 'warn'> = {
  seotda: 'accent',
  gostop: 'win',
  poker: 'warn',
}
