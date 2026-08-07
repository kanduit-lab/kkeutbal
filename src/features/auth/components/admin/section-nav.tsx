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
 * 어느 폭에서든 한 줄 가로 탭. 데스크톱 좌측 14rem 세로 레일이던 것을 걷어냈다 —
 * 탭 4개에 본문 폭을 14rem 내주느라 회원 표 열이 눌렸다.
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
      className="shrink-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div
        role="tablist"
        className="flex w-full min-w-max items-center gap-1 rounded-2xl border border-gold/15 bg-bg-deep/45 p-1"
      >
        {ADMIN_SECTIONS.map((section) => {
          const copy = d.adminDashboard.sections[section]
          const active = activeSection === section
          return (
            <Button
              key={section}
              type="button"
              role="tab"
              aria-selected={active}
              variant="ghost"
              size="sm"
              pressed={active}
              onClick={() => onSelect(section)}
              className={clsx(
                'min-w-0 flex-1 justify-center gap-2 whitespace-nowrap rounded-xl px-3',
                active
                  ? 'bg-gold/15 text-text ring-1 ring-inset ring-gold/40'
                  : 'text-muted hover:bg-surface-raised hover:text-text',
              )}
            >
              <span className="text-base leading-none" aria-hidden="true">
                {SECTION_ICON[section]}
              </span>
              <span className="truncate font-bold">{copy.label}</span>
              {loadedSections.includes(section) ? (
                <span className="size-1.5 shrink-0 rounded-full bg-win" aria-hidden="true" />
              ) : null}
            </Button>
          )
        })}
      </div>
    </nav>
  )
}
