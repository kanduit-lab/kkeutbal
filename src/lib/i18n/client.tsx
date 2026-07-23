'use client'

import { createContext, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'
import type { Locale } from './config'
import type { Dictionary } from './dictionaries/ko'

export { format } from './format'
export type { Dictionary } from './dictionaries/ko'
export type { Locale } from './config'

interface I18nValue {
  locale: Locale
  d: Dictionary
}

const I18nContext = createContext<I18nValue | null>(null)

export function I18nProvider({
  locale,
  dict,
  children,
}: {
  locale: Locale
  dict: Dictionary
  children: ReactNode
}) {
  const value = useMemo(() => ({ locale, d: dict }), [locale, dict])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const context = useContext(I18nContext)
  if (!context) throw new Error('useI18n must be used within I18nProvider')
  return context
}

/**
 * 클라이언트 사전 소비 훅 — `{ d, locale }` 를 돌려준다. useI18n 의 별칭이며,
 * 새 코드는 이 이름을 쓴다. layout.tsx 의 I18nProvider 아래에서만 동작한다.
 *
 * 사용:
 *   const { d, locale } = useDict()
 *   <span>{d.actionBar.myChips}</span>
 *   toast(format(d.room.toastRoundStarted, { seq }))
 */
export function useDict(): I18nValue {
  return useI18n()
}

/**
 * 서버 액션 에러 해석. 액션은 `errors.*` 키 또는 원문 문자열을 반환한다 —
 * 키면 번역하고, 아니면 그대로 보여준다.
 *
 * 이번 라운드에는 대부분의 서버 액션이 여전히 한국어 원문 문자열을 반환한다 —
 * 그 문자열은 그대로 통과시켜 보여주는 것이 의도된 동작이다(허용 범위).
 * 액션이 점진적으로 `errors.*` 키를 반환하도록 바뀌면 자동으로 번역이 적용된다.
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
