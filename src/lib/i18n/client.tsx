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

export function useDict(): I18nValue {
  return useI18n()
}

export { translateError } from './translate-error'