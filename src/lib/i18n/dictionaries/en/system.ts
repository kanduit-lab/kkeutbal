// ko 쪽 타입을 명시적으로 붙여 두면 ko에 없는 여분 키가 타입 에러로 잡힌다.
// 분할 전 en.ts는 인라인 리터럴이라 이 검사가 공짜였는데, 참조값 조립으로
// 바뀌면서 그 방향이 뚫렸다 — 두 언어가 갈라지지 않게 막는 장치라 복원한다.
import type { Dictionary } from '../ko'

export const ui: Dictionary['ui'] = {
  processing: 'Processing…',
  decrease: 'Decrease',
  increase: 'Increase',
} as const

export const loading: Dictionary['loading'] = {
  default: 'Loading…',
  enteringRoom: 'Entering room…',
  computingResult: 'Tallying results…',
  ranking: 'Loading rankings…',
  playerStats: 'Loading player record…',
  admin: 'Opening admin tools…',
  advisor: 'Opening jokbo advisor…',
  wallet: 'Loading virtual credits…',
} as const

export const errorPage: Dictionary['errorPage'] = {
  title: 'Something went wrong',
  body: 'Try again in a moment.',
  retry: 'Try again',
  notFoundTitle: 'Page not found',
  notFoundBody: 'Check the address or start again from home.',
} as const
