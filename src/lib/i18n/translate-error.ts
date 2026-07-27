import type { Dictionary } from './dictionaries/ko'

/**
 * 서버 액션 에러 해석. 액션은 `errors.*` 키 또는 원문 문자열을 반환한다 —
 * 키면 번역하고, 아니면 그대로 보여준다.
 *
 * 이 모듈에는 'use client' 를 붙이지 않는다. 서버 컴포넌트와 클라이언트 컴포넌트가
 * 같은 구현을 쓰기 위해서다 — 각자 로컬 복사본을 두면 폴백 규칙이 갈라진다.
 * 클라이언트는 `@/lib/i18n/client`, 서버는 `@/lib/i18n/server` 에서 가져다 쓴다.
 *
 * 모든 서버 액션은 `errors.*` 키를 반환할 것 — 원문 문자열을 반환하지 않는다.
 * 에러를 토스트·배너로 표면화하는 모든 지점은 원문을 직접 렌더하지 말고
 * 이 함수를 거칠 것: `toast(translateError(d, result.error), 'error')`.
 */
export function translateError(d: Dictionary, message: string): string {
  if (message.startsWith('errors.')) {
    const key = message.slice('errors.'.length) as keyof Dictionary['errors']
    return d.errors[key] ?? message
  }
  return message
}
