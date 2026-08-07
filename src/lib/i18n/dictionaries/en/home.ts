// ko 쪽 타입을 명시적으로 붙여 두면 ko에 없는 여분 키가 타입 에러로 잡힌다.
// 분할 전 en.ts는 인라인 리터럴이라 이 검사가 공짜였는데, 참조값 조립으로
// 바뀌면서 그 방향이 뚫렸다 — 두 언어가 갈라지지 않게 막는 장치라 복원한다.
import type { Dictionary } from '../ko'

export const home: Dictionary['home'] = {
  joinTitle: 'Join room',
  codePlaceholder: 'Room code (6 chars)',
  join: 'Join',
  joining: 'Joining…',
  newRoom: '+ New room',
  advisor: 'Hand reader',
  ranking: 'Ranking',
  guide: 'Guide',
  activeRooms: 'My rooms',
  emptyTitle: "You're not in any rooms yet",
  emptyHint: 'Enter a room code above, or create a new room',
  recentSessions: 'Past sessions',
  recentEmptyTitle: 'No finished sessions yet',
  recentEmptyHint: 'Settle a room and your net shows up here',
  listNavLabel: 'Select list',
  navLabel: 'Main menu',
  netUnit: 'chips',
  memberCount: '{n} players',
  aboutLink: 'About Kkeutbal',
} as const
