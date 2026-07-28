import type { Dictionary } from '@/lib/i18n/client'
import { format } from '@/lib/i18n/client'
import type { AdminUserView } from '../../admin-queries'

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