export const ui = {
  processing: '처리 중…',
  decrease: '줄이기',
  increase: '늘리기',
  editValue: '직접 입력',
  editValueHint: '{min} ~ {max} 사이로 입력하세요',
  editValueInvalid: '{min} ~ {max} 사이의 숫자를 입력하세요',
  apply: '적용',
  cancel: '취소',
} as const

export const loading = {
  default: '불러오는 중…',
  enteringRoom: '방에 들어가는 중…',
  computingResult: '결과 집계 중…',
  ranking: '랭킹 불러오는 중…',
  playerStats: '전적 불러오는 중…',
  admin: '관리자 도구 여는 중…',
  advisor: '족보 판독 여는 중…',
  wallet: '가상 크레딧 불러오는 중…',
} as const

export const errorPage = {
  title: '문제가 생겼습니다',
  body: '잠시 후 다시 시도하세요.',
  retry: '다시 시도',
  notFoundTitle: '페이지를 찾을 수 없습니다',
  notFoundBody: '주소를 확인하거나 홈에서 다시 시작하세요.',
} as const
