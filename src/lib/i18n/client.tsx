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

/** 서버·클라이언트 공용 구현을 재노출한다 — 소비자는 이 모듈만 알면 된다. */
export { translateError } from './translate-error'
