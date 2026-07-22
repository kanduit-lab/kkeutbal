import { cookies } from 'next/headers'
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from './config'
import { ko, type Dictionary } from './dictionaries/ko'
import { en } from './dictionaries/en'

const DICTIONARIES: Record<Locale, Dictionary> = { ko, en }

export async function getLocale(): Promise<Locale> {
  const store = await cookies()
  const value = store.get(LOCALE_COOKIE)?.value
  return isLocale(value) ? value : DEFAULT_LOCALE
}

export async function getDict(): Promise<{ locale: Locale; d: Dictionary }> {
  const locale = await getLocale()
  return { locale, d: DICTIONARIES[locale] }
}
