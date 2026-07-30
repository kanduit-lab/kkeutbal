'use client'

import { clsx } from 'clsx'
import { Button } from '@/components/ui'
import { useDict } from '@/lib/i18n/client'
import { ADMIN_SECTIONS, type AdminSection } from '../../admin-dashboard-types'

const SECTION_ICON: Record<AdminSection, string> = {
  settings: '⚙️',
  access: '🎫',
  people: '👥',
  operations: '📣',
}

/**
 * 데스크톱은 왼쪽 세로 레일, 모바일은 위쪽 네 칸 — 둘 다 높이가 고정이라
 * 본문이 쓸 공간이 예측 가능하다.
 */
export function SectionNav({
  activeSection,
  loadedSections,
  onSelect,
}: {
  activeSection: AdminSection
  loadedSections: readonly AdminSection[]
  onSelect: (section: AdminSection) => void
}) {
  const { d } = useDict()
  return (
    <nav
      aria-label={d.adminDashboard.sectionNavLabel}
      className="grid shrink-0 grid-cols-4 gap-1.5 lg:grid-cols-1 lg:gap-2 lg:self-start"
    >
      {ADMIN_SECTIONS.map((section) => {
        const copy = d.adminDashboard.sections[section]
        const active = activeSection === section
        return (
          <Button
            key={section}
            type="button"
            variant={active ? 'surface' : 'outline'}
            pressed={active}
            onClick={() => onSelect(section)}
            className={clsx(
              'min-h-14 flex-col items-center gap-0 rounded-xl px-1 lg:min-h-16 lg:flex-row lg:items-center lg:gap-3 lg:rounded-2xl lg:px-3 lg:text-left',
              active ? 'border-gold/50 bg-gold/15 text-text' : 'bg-bg-deep/35 text-muted',
            )}
          >
            <span className="text-lg leading-none lg:text-2xl" aria-hidden="true">
              {SECTION_ICON[section]}
            </span>
            <span className="min-w-0 lg:flex-1">
              <span className="block truncate text-[11px] font-bold text-text lg:text-sm">
                {copy.label}
              </span>
              <span className="hidden truncate text-xs font-medium lg:block">{copy.short}</span>
            </span>
            {loadedSections.includes(section) ? (
              <span className="hidden size-2 shrink-0 rounded-full bg-win lg:block" />
            ) : null}
          </Button>
        )
      })}
    </nav>
  )
}
