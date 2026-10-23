'use client'

import { clsx } from 'clsx'
import { useEffect, useRef, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui'
import { useDict } from '@/lib/i18n/client'
import { ADMIN_SECTIONS, type AdminSection } from '../../admin-dashboard-types'

const SECTION_ICON: Record<AdminSection, string> = {
  settings: '⚙️',
  registrationCodes: '🔑',
  guestTokens: '🎟️',
  people: '👥',
  operations: '📣',
}

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
  const tabListRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    tabListRef.current
      ?.querySelector<HTMLButtonElement>(`[data-admin-section="${activeSection}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeSection])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = ADMIN_SECTIONS.indexOf(activeSection)
    const nextIndex =
      event.key === 'ArrowRight'
        ? (currentIndex + 1) % ADMIN_SECTIONS.length
        : event.key === 'ArrowLeft'
          ? (currentIndex - 1 + ADMIN_SECTIONS.length) % ADMIN_SECTIONS.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? ADMIN_SECTIONS.length - 1
              : null

    if (nextIndex === null) return

    event.preventDefault()
    const nextSection = ADMIN_SECTIONS[nextIndex]
    if (!nextSection) return

    onSelect(nextSection)
    event.currentTarget
      .querySelector<HTMLButtonElement>(`[data-admin-section="${nextSection}"]`)
      ?.focus()
  }

  return (
    <nav
      aria-label={d.adminDashboard.sectionNavLabel}
      className="shrink-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div
        ref={tabListRef}
        role="tablist"
        onKeyDown={handleKeyDown}
        className="flex w-max min-w-full items-center gap-1 rounded-2xl border border-gold/15 bg-inset p-1 lg:w-full lg:flex-col lg:items-stretch"
      >
        {ADMIN_SECTIONS.map((section) => {
          const copy = d.adminDashboard.sections[section]
          const active = activeSection === section
          return (
            <Button
              key={section}
              type="button"
              role="tab"
              data-admin-section={section}
              aria-selected={active}
              variant="ghost"
              size="sm"
              pressed={active}
              onClick={() => onSelect(section)}
              className={clsx(
                'min-w-0 flex-1 justify-center gap-2 whitespace-nowrap rounded-xl px-3 lg:flex-none lg:justify-start lg:px-3 lg:py-3',
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
