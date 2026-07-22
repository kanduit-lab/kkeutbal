'use client'

import { createContext, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'
import type { Locale } from './config'
import type { Dictionary } from './dictionaries/ko'

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
 * 서버 액션 에러 해석. 액션은 `errors.*` 키 또는 원문 문자열을 반환한다 —
 * 키면 번역하고, 아니면 그대로 보여준다.
 */
export function translateError(d: Dictionary, message: string): string {
  if (message.startsWith('errors.')) {
    const key = message.slice('errors.'.length) as keyof Dictionary['errors']
    return d.errors[key] ?? message
  }
  return message
}
