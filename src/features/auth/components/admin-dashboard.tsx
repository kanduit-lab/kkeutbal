'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { loadAdminSection } from '../admin-dashboard-actions'
import { ADMIN_SECTIONS, type AdminSection, type AdminSectionData } from '../admin-dashboard-types'
import { AdminClient } from './admin-client'
import { CreditAdmin } from '@/features/wallet/components/credit-admin'
import { PromotionsAdmin } from '@/features/promotions/components/promotions-admin'
import { Alert, Badge, Button, ButtonLink, Panel, Skeleton } from '@/components/ui'
import { translateError, useDict } from '@/lib/i18n/client'

interface SectionLoadState {
  readonly data?: AdminSectionData
  readonly loading: boolean
  readonly slow: boolean
  readonly error?: string
}

const SECTION_ICON: Record<AdminSection, string> = {
  settings: '⚙️',
  access: '🎫',
  people: '👥',
  operations: '📣',
}

export function SectionSkeleton({ label }: { label: string }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {[0, 1].map((index) => (
        <Panel key={index} className="min-h-52 space-y-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-12" radius="xl" />
          <Skeleton className="h-12" radius="xl" />
          <Skeleton className="h-10" radius="xl" />
        </Panel>
      ))}
    </div>
  )
}

export function AdminDashboard({ selfId }: { selfId: string }) {
  const { d } = useDict()
  const [activeSection, setActiveSection] = useState<AdminSection>('settings')
  const [states, setStates] = useState<Partial<Record<AdminSection, SectionLoadState>>>({})
  const requestIds = useRef<Record<AdminSection, number>>({
    settings: 0,
    access: 0,
    people: 0,
    operations: 0,
  })

  const load = useCallback(async (section: AdminSection, preserveData = false) => {
    const requestId = requestIds.current[section] + 1
    requestIds.current[section] = requestId
    setStates((current) => {
      const previous = current[section]
      return {
        ...current,
        [section]: {
          data: preserveData ? previous?.data : undefined,
          loading: true,
          slow: false,
        },
      }
    })

    const slowTimer = window.setTimeout(() => {
      if (requestIds.current[section] !== requestId) return
      setStates((current) => {
        const previous = current[section]
        if (!previous?.loading) return current
        return { ...current, [section]: { ...previous, slow: true } }
      })
    }, 4000)

    let result: Awaited<ReturnType<typeof loadAdminSection>>
    try {
      result = await loadAdminSection({ section })
    } catch {
      window.clearTimeout(slowTimer)
      if (requestIds.current[section] !== requestId) return
      setStates((current) => {
        const previous = current[section]
        return {
          ...current,
          [section]: {
            data: preserveData ? previous?.data : undefined,
            loading: false,
            slow: false,
            error: 'errors.adminDashboardLoadFailed',
          },
        }
      })
      return
    }

    window.clearTimeout(slowTimer)
    if (requestIds.current[section] !== requestId) return

    setStates((current) => {
      const previous = current[section]
      if (result.success) {
        return {
          ...current,
          [section]: { data: result.data, loading: false, slow: false },
        }
      }
      return {
        ...current,
        [section]: {
          data: preserveData ? previous?.data : undefined,
          loading: false,
          slow: false,
          error: result.error,
        },
      }
    })
  }, [])

  useEffect(() => {
    if (!states[activeSection]) void load(activeSection)
  }, [activeSection, load, states])

  function renderSection(data: AdminSectionData, reload: () => void) {
    switch (data.section) {
      case 'settings':
        return (
          <AdminClient
            section="settings"
            ssoSettings={data.ssoSettings}
            visionSettings={data.visionSettings}
            onDataChanged={reload}
          />
        )
      case 'access':
        return (
          <AdminClient
            section="access"
            tokens={data.tokens}
            registrationCodes={data.registrationCodes}
            onDataChanged={reload}
          />
        )
      case 'people':
        return (
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <AdminClient
              section="people"
              selfId={selfId}
              users={data.users}
              onDataChanged={reload}
            />
            <CreditAdmin users={data.users} onDataChanged={reload} />
          </div>
        )
      case 'operations':
        return (
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <AdminClient section="operations" rooms={data.rooms} onDataChanged={reload} />
            <PromotionsAdmin promotions={data.promotions} onDataChanged={reload} />
          </div>
        )
    }
  }

  return (
    <div className="space-y-5">
      <nav
        aria-label={d.adminDashboard.sectionNavLabel}
        className="grid grid-cols-2 gap-2 lg:grid-cols-4"
      >
        {ADMIN_SECTIONS.map((section) => {
          const copy = d.adminDashboard.sections[section]
          const active = activeSection === section
          const loaded = Boolean(states[section]?.data)
          return (
            <button
              key={section}
              type="button"
              aria-pressed={active}
              onClick={() => setActiveSection(section)}
              className={`rounded-2xl border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 ${
                active
                  ? 'border-gold/50 bg-gold/15 text-text'
                  : 'border-white/10 bg-bg-deep/35 text-muted hover:border-white/20 hover:text-text'
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-xl" aria-hidden="true">
                  {SECTION_ICON[section]}
                </span>
                {loaded ? <span className="size-1.5 rounded-full bg-win" /> : null}
              </span>
              <span className="mt-2 block text-sm font-bold">{copy.label}</span>
              <span className="mt-0.5 hidden text-xs sm:block">{copy.short}</span>
            </button>
          )
        })}
      </nav>
      <section aria-labelledby={`admin-${activeSection}-title`}>
        <div className="mb-4 flex items-end justify-between gap-4 px-1">
          <div>
            <h2 id={`admin-${activeSection}-title`} className="text-xl font-black">
              {d.adminDashboard.sections[activeSection].label}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {d.adminDashboard.sections[activeSection].description}
            </p>
          </div>
          <Badge tone="muted">{d.adminDashboard.onDemand}</Badge>
        </div>
        {ADMIN_SECTIONS.map((section) => {
          const state = states[section]
          if (section !== activeSection) {
            return state?.data ? (
              <div key={section} hidden>
                {renderSection(state.data, () => void load(section, true))}
              </div>
            ) : null
          }

          if (!state || (!state.data && state.loading)) {
            return (
              <div key={section} className="space-y-3">
                {state?.slow ? (
                  <Panel className="border border-gold/20 bg-gold/5 py-3">
                    <p className="text-sm font-bold">{d.adminDashboard.slowTitle}</p>
                    <p className="mt-1 text-xs text-muted">{d.adminDashboard.slowBody}</p>
                  </Panel>
                ) : null}
                <SectionSkeleton label={d.common.loading} />
              </div>
            )
          }

          if (!state?.data) {
            const permissionDenied = state?.error === 'errors.adminOnlyChange'
            return (
              <Panel key={section} className="space-y-4 py-8 text-center">
                <p className="text-3xl" aria-hidden="true">
                  {permissionDenied ? '🔒' : '⚠️'}
                </p>
                <div>
                  <p className="font-bold">
                    {permissionDenied ? d.adminDashboard.deniedTitle : d.adminDashboard.loadFailed}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {state?.error
                      ? translateError(d, state.error)
                      : d.adminDashboard.loadFailedBody}
                  </p>
                </div>
                {permissionDenied ? (
                  <ButtonLink href="/" variant="primary">
                    {d.common.home}
                  </ButtonLink>
                ) : (
                  <Button type="button" variant="primary" onClick={() => void load(section)}>
                    {d.common.retry}
                  </Button>
                )}
              </Panel>
            )
          }

          return (
            <div key={section} className="space-y-3">
              {state.error ? (
                <Alert tone="error" className="flex items-center justify-between gap-3">
                  <span>{translateError(d, state.error)}</span>
                  <Button size="sm" onClick={() => void load(section, true)}>
                    {d.common.retry}
                  </Button>
                </Alert>
              ) : state.loading ? (
                <p role="status" className="px-1 text-xs text-muted">
                  {d.adminDashboard.refreshing}
                </p>
              ) : null}
              {renderSection(state.data, () => void load(section, true))}
            </div>
          )
        })}
      </section>
    </div>
  )
}