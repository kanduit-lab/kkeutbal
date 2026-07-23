/**
 * 한국어 원본 사전. 모든 로케일의 키 구조는 이 파일이 결정한다.
 * UI 문자열은 여기에만 둔다 — 컴포넌트 하드코딩 금지.
 */
export const ko = {
  common: {
    appName: '끗발',
    back: '뒤로',
    cancel: '취소',
    home: '홈으로',
    logout: '로그아웃',
    waiting: '대기',
    playing: '진행 중',
    clearAll: '전체 해제',
    people: '명',
    loading: '불러오는 중…',
  },
  games: {
    seotda: '섯다',
    gostop: '고스톱',
    poker: '포커',
  },
  login: {
    authentik: 'Authentik 로그인',
    guestTitle: '게스트 로그인',
    guestHint: '같은 이름으로 로그인하면 같은 계정입니다',
    namePlaceholder: '이름',
    enter: '로그인',
    notConfigured: '로그인 방법이 설정되지 않았습니다. 서버 환경변수를 확인하세요.',
  },
  home: {
    joinTitle: '방 입장',
    codePlaceholder: '방 코드 6자리',
    join: '입장',
    newRoom: '+ 방 만들기',
    advisor: '족보 판독',
    ranking: '누적 랭킹',
    guide: '게임 가이드',
    activeRooms: '참여 중인 방',
    emptyTitle: '참여 중인 방이 없습니다',
  },
  errors: {
    loginRequired: '로그인이 필요합니다',
    invalidInput: '입력값이 올바르지 않습니다',
    roomNotFound: '방을 찾을 수 없습니다',
    roomCodeNotFound: '그 코드로 만든 방이 없습니다',
    roomEnded: '이미 끝난 방입니다',
    roomFull: '방이 가득 찼습니다 (최대 10명)',
    notMember: '이 방의 참가자가 아닙니다',
    invalidRoom: '방 정보가 올바르지 않습니다',
    codeLength: '방 코드는 6자입니다',
  },
} as const

type DeepStrings<T> = {
  readonly [K in keyof T]: T[K] extends string ? string : DeepStrings<T[K]>
}

/** en 등 다른 로케일이 따라야 하는 구조. */
export type Dictionary = DeepStrings<typeof ko>
