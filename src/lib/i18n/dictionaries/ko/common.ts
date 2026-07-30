export const meta = {
  title: '끗발',
  description: '판돈 없이 즐기는 섯다·고스톱·포커 판 기록',
} as const

export const common = {
  appName: '끗발',
  admin: '관리자',
  back: '뒤로',
  cancel: '취소',
  confirm: '확정',
  close: '닫기',
  skipToContent: '본문으로 건너뛰기',
  save: '저장',
  saving: '저장 중…',
  home: '홈으로',
  logout: '로그아웃',
  myCredits: '내 크레딧',
  waiting: '대기',
  playing: '진행 중',
  clearAll: '전체 해제',
  people: '명',
  loading: '불러오는 중…',
  me: '나',
  retry: '다시 시도',
  online: '접속',
  offline: '오프라인',
  unknownPlayer: '알 수 없음',
  itemCount: '{n}건',
  pager: {
    navLabel: '페이지 이동',
    prev: '이전 페이지',
    next: '다음 페이지',
    status: '{page} / {total}',
    range: '{from}–{to} · 총 {total}',
  },
} as const

export const games = {
  seotda: '섯다',
  gostop: '고스톱',
  poker: '포커',
} as const

export const roles = {
  host: '방장',
  dealer: '딜러',
  player: '플레이어',
  observer: '관전자',
  observerShort: '관전',
} as const

export const bet = {
  seotda: {
    check: '체크',
    call: '콜',
    raise: '레이즈',
    fold: '다이',
    allin: '올인',
  },
  poker: {
    check: '체크',
    call: '콜',
    raise: '레이즈',
    fold: '폴드',
    allin: '올인',
  },
} as const

export const presets = {
  pping: '삥',
  ttadang: '따당',
  half: '하프',
  full: '풀',
  pot: '팟',
  double: '따블',
} as const

export const inputMode = {
  label: '입력 모드',
  trust: '바로 반영',
  approval: '딜러 승인',
  trustHint: '각자 입력한 베팅이 바로 반영돼요',
  approvalHint: '딜러가 승인한 베팅만 반영돼요',
} as const
