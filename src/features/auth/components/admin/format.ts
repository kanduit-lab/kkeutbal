import type { Dictionary } from '@/lib/i18n/client'
import { format } from '@/lib/i18n/client'
import type { AdminUserView } from '../../admin-queries'

/**
 * 관리자 콘솔의 날짜·경과시간·계정종류 표기. 전부 로케일을 인자로 받는다 —
 * 예전에는 `toLocaleDateString('ko-KR')` 이 하드코딩돼 있어서 en 로케일 화면에
 * `2026. 7. 27.` 과 `3시간 전` 이 그대로 섞여 나왔다.
 */

/** 방 생성 후 경과 시간 — 방치 여부 판단용이라 분/시간/일 단위면 충분하다. */
export function formatAge(d: Dictionary, createdAt: string): string {
  const minutes = Math.floor((Date.now() - Date.parse(createdAt)) / 60_000)
  if (minutes < 1) return d.adminConsole.relative.justNow
  if (minutes < 60) return format(d.adminConsole.relative.minutes, { n: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return format(d.adminConsole.relative.hours, { n: hours })
  return format(d.adminConsole.relative.days, { n: Math.floor(hours / 24) })
}

export function formatDate(locale: string, value: string): string {
  return new Date(value).toLocaleDateString(locale)
}

export function accountTypeLabel(d: Dictionary, type: AdminUserView['authType']): string {
  if (type === 'internal') return d.adminConsole.accountType.internal
  if (type === 'sso') return d.adminConsole.accountType.sso
  return d.adminConsole.accountType.guest
}
