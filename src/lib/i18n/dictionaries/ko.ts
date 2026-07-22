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
    tagline1: '누가 얼마 땄는지,',
    tagline2: '끝까지 다 남습니다.',
    authentik: 'Authentik 으로 로그인',
    guestTitle: '이름만 대면 입장',
    guestHint: '같은 이름으로 오면 전적이 이어져요',
    namePlaceholder: '이름 (예: 영창)',
    enter: '판에 앉기',
    notConfigured: '로그인 방법이 설정되지 않았어요. 서버 환경변수를 확인해 주세요.',
  },
  home: {
    greeting: ' 님, 오늘도 좋은 패 받으세요',
    joinTitle: '판에 끼기',
    codePlaceholder: '6자리 코드',
    join: '입장',
    newRoom: '+ 새 판 벌이기',
    advisor: '족보 도우미',
    advisorHint: '이 패 뭐지?',
    ranking: '누적 랭킹',
    rankingHint: '지금까지 전적',
    guide: '게임 가이드',
    guideHint: '규칙·사용법',
    activeRooms: '진행 중인 판',
    emptyTitle: '아직 참여 중인 판이 없어요',
    emptyHint: '새로 만들거나 받은 코드로 들어오세요',
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
