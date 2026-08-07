import Link from 'next/link'
import type { Route } from 'next'
import type { Dictionary } from '@/lib/i18n/client'

/**
 * 홈 상단 가로 탭. 링크가 줄바꿈되면 헤더 높이가 늘고, `FixedPage`가 `overflow-hidden`이라
 * 그만큼 목록 아래가 잘렸다. 가로 스크롤 한 줄이면 항목이 늘어도 높이가 고정이다.
 */
export interface HomeNavItem {
  readonly href: Route
  readonly label: string
}

export function homeNavItems(d: Dictionary, isAdmin: boolean): readonly HomeNavItem[] {
  return [
    { href: '/wallet' as Route, label: d.common.myCredits },
    { href: '/account' as Route, label: d.account.navLabel },
    ...(isAdmin ? [{ href: '/admin' as Route, label: d.common.admin }] : []),
    { href: '/about' as Route, label: d.home.aboutLink },
  ]
}

export function HomeNav({ items, label }: { items: readonly HomeNavItem[]; label: string }) {
  return (
    <nav
      aria-label={label}
      className="-mx-1 min-w-0 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <ul className="flex w-max items-center gap-1 rounded-2xl border border-gold/15 bg-bg-deep/50 p-1">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="inline-flex min-h-9 items-center whitespace-nowrap rounded-xl px-3 text-xs font-bold text-muted transition hover:bg-surface-raised hover:text-text lg:text-sm"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
