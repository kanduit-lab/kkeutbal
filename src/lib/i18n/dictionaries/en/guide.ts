// ko 쪽 타입을 명시적으로 붙여 두면 ko에 없는 여분 키가 타입 에러로 잡힌다.
// 분할 전 en.ts는 인라인 리터럴이라 이 검사가 공짜였는데, 참조값 조립으로
// 바뀌면서 그 방향이 뚫렸다 — 두 언어가 갈라지지 않게 막는 장치라 복원한다.
import type { Dictionary } from '../ko'

export const guide: Dictionary['guide'] = {
  indexTitle: 'Guides',
  indexSubtitle: 'Hand ranking tables and how to use the app',
  usageTitle: 'How to use',
  backToList: 'Back to guide list',
  tocTitle: 'Contents',
  backToTop: 'Back to top',
  tableAria: '{title}, scrolls horizontally',
} as const

export const about: Dictionary['about'] = {
  tagline: 'Records bets and results for Seotda, Go-Stop, and Poker.',
  featureRealtimeTitle: 'Realtime table',
  featureRealtimeBody: 'Players record bets on their phones, and room screens stay in sync.',
  featureSettleTitle: 'Automatic settlement',
  featureSettleBody: 'Records wins and chip movements for each round and totals session results.',
  featureRankingTitle: 'Lifetime ranking',
  featureRankingBody: 'Totals settled session records by account.',
  featureAdvisorTitle: '족보 reader',
  featureAdvisorBody: 'Select cards or take a photo to check 족보 (jokbo, hand ranking).',
  howTitle: 'How to use',
  step1: 'Create a room and choose a game and starting chips',
  step2: 'Join with the 6-character code or link',
  step3: 'Record bets on each player’s phone',
  step4: 'The dealer confirms the winner after each round',
  step5: 'Settle the session to view results and rankings',
  disclaimer:
    'A record-keeping tool. No real money or valuables change hands. The 화투 (hwatu) card artwork is licensed under CC BY-SA 4.0.',
  start: 'Get started',
  guideLink: 'Game guide',
} as const
