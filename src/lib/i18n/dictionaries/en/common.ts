// ko 쪽 타입을 명시적으로 붙여 두면 ko에 없는 여분 키가 타입 에러로 잡힌다.
// 분할 전 en.ts는 인라인 리터럴이라 이 검사가 공짜였는데, 참조값 조립으로
// 바뀌면서 그 방향이 뚫렸다 — 두 언어가 갈라지지 않게 막는 장치라 복원한다.
import type { Dictionary } from '../ko'

export const meta: Dictionary['meta'] = {
  title: 'Kkeutbal',
  description: 'No-stakes score tracking for Seotda, Go-Stop, and Poker',
} as const

export const common: Dictionary['common'] = {
  appName: 'Kkeutbal',
  admin: 'Admin',
  back: 'Back',
  cancel: 'Cancel',
  confirm: 'Confirm',
  close: 'Close',
  skipToContent: 'Skip to content',
  save: 'Save',
  saving: 'Saving…',
  home: 'Home',
  logout: 'Sign out',
  myCredits: 'My credits',
  waiting: 'Waiting',
  playing: 'Live',
  clearAll: 'Clear all',
  people: ' players',
  loading: 'Loading…',
  me: 'Me',
  retry: 'Try again',
  online: 'Online',
  offline: 'Offline',
  unknownPlayer: 'Unknown',
  itemCount: '{n} items',
  pager: {
    navLabel: 'Pagination',
    prev: 'Previous page',
    next: 'Next page',
    status: '{page} / {total}',
    range: '{from}–{to} of {total}',
  },
} as const

export const games: Dictionary['games'] = {
  seotda: 'Seotda',
  gostop: 'Go-Stop',
  poker: 'Poker',
} as const

export const roles: Dictionary['roles'] = {
  host: 'Host',
  dealer: 'Dealer',
  player: 'Player',
  observer: 'Observer',
  observerShort: 'Observer',
} as const

export const bet: Dictionary['bet'] = {
  seotda: {
    check: 'Check',
    call: 'Call',
    raise: 'Raise',
    fold: '다이',
    allin: 'All-in',
  },
  poker: {
    check: 'Check',
    call: 'Call',
    raise: 'Raise',
    fold: 'Fold',
    allin: 'All-in',
  },
} as const

export const presets: Dictionary['presets'] = {
  pping: '삥',
  ttadang: '따당',
  half: 'Half',
  full: 'Full',
  pot: 'Pot',
  double: '×2',
} as const

export const inputMode: Dictionary['inputMode'] = {
  label: 'Input mode',
  trust: 'Instant',
  approval: 'Dealer approval',
  trustHint: 'Bets each player enters apply immediately',
  approvalHint: 'Only bets the dealer approves apply',
} as const
