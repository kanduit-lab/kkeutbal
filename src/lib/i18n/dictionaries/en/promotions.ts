// ko 쪽 타입을 명시적으로 붙여 두면 ko에 없는 여분 키가 타입 에러로 잡힌다.
// 분할 전 en.ts는 인라인 리터럴이라 이 검사가 공짜였는데, 참조값 조립으로
// 바뀌면서 그 방향이 뚫렸다 — 두 언어가 갈라지지 않게 막는 장치라 복원한다.
import type { Dictionary } from '../ko'

export const promotionsAdmin: Dictionary['promotionsAdmin'] = {
  title: 'Banners · popups',
  kindLabel: 'Kind',
  kindBanner: 'Banner',
  kindPopup: 'Popup',
  titleLabel: 'Title',
  titlePlaceholder: 'Ad enquiries',
  titleRequired: 'Enter a title',
  bodyLabel: 'Body · optional',
  bodyPlaceholder: 'Description shown with the banner or popup',
  linkUrlLabel: 'Link URL · optional',
  linkUrlPlaceholder: 'https://… or /about',
  linkLabelLabel: 'Link text · optional',
  linkLabelPlaceholder: 'Learn more',
  priorityLabel: 'Priority · higher shows first',
  dismissHoursLabel: 'Hide for · hours',
  startsInHoursLabel: 'Starts in hours · 0 means now',
  endsInHoursLabel: 'Ends in hours · 0 means never',
  rangeInvalid: 'Check the numeric ranges',
  submit: 'Create',
  created: 'Created',
  empty: 'No banners or popups',
  emptyHint: 'Enter a title above and press Create',
  live: 'Live',
  scheduled: 'Scheduled',
  stopped: 'Stopped',
  meta: 'priority {priority} · hidden {hours} h · {author}',
  pause: 'Pause',
  resume: 'Resume',
  paused: 'Paused',
  resumed: 'Resumed',
  remove: 'Delete',
  removed: 'Deleted',
  removeTitle: 'Delete {title}?',
  removeBody: 'This cannot be undone. To take it down temporarily, use Pause',
} as const

export const promo: Dictionary['promo'] = {
  close: 'Close',
  dismissFor: 'Hide for {hours}h',
  learnMore: 'Learn more',
} as const
