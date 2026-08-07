'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { loadAdminSection } from '../admin-dashboard-actions'
import { ADMIN_SECTIONS, type AdminSection, type AdminSectionData } from '../admin-dashboard-types'
import { AccessPanel } from './admin/access-panel'
import { MembersPanel } from './admin/members-panel'
import { RoomsPanel } from './admin/rooms-panel'
import { SectionNav } from './admin/section-nav'
import { SsoSettingsPanel } from './admin/sso-settings-panel'
import { VisionSettingsPanel } from './admin/vision-settings-panel'
import { PromotionsAdmin } from '@/features/promotions/components/promotions-admin'
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  PaneGroup,
  Panel,
  ScrollPane,
  Skeleton,
} from '@/components/ui'
import { translateError, useDict } from '@/lib/i18n/client'

interface SectionLoadState {
  readonly data?: AdminSectionData
  readonly loading: boolean
  readonly slow: boolean
  readonly error?: string
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

  const loadedSections = ADMIN_SECTIONS.filter((section) => Boolean(states[section]?.data))

  function renderSection(data: AdminSectionData, reload: () => void) {
    switch (data.section) {
      case 'settings':
        return (
          <PaneGroup
            ariaLabel={d.adminDashboard.paneNavLabel}
            panes={[
              {
                key: 'sso',
                label: d.adminConsole.sso.paneLabel,
                node: (
                  <ScrollPane label={d.adminConsole.sso.title}>
                    <SsoSettingsPanel settings={data.ssoSettings} onDataChanged={reload} />
                  </ScrollPane>
                ),
              },
              {
                key: 'vision',
                label: d.adminConsole.vision.paneLabel,
                node: (
                  <ScrollPane label={d.adminConsole.vision.title}>
                    <VisionSettingsPanel settings={data.visionSettings} onDataChanged={reload} />
                  </ScrollPane>
                ),
              },
            ]}
          />
        )
      case 'access':
        return (
          <AccessPanel
            tokens={data.tokens}
            registrationCodes={data.registrationCodes}
            onDataChanged={reload}
          />
        )
      case 'people':
        // 크레딧 관리는 다이얼로그로 빠졌다. 회원 표가 폭을 전부 쓴다.
        return (
          <MembersPanel
            selfId={selfId}
            users={data.users}
            total={data.userTotal}
            onDataChanged={reload}
          />
        )
      case 'operations':
        return (
          <PaneGroup
            ariaLabel={d.adminDashboard.paneNavLabel}
            panes={[
              {
                key: 'rooms',
                label: d.adminConsole.rooms.title,
                node: (
                  <RoomsPanel rooms={data.rooms} total={data.roomTotal} onDataChanged={reload} />
                ),
              },
              {
                key: 'promotions',
                label: d.promotionsAdmin.title,
                node: (
                  <ScrollPane label={d.promotionsAdmin.title}>
                    <PromotionsAdmin promotions={data.promotions} onDataChanged={reload} />
                  </ScrollPane>
                ),
              },
            ]}
          />
        )
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <SectionNav
        activeSection={activeSection}
        loadedSections={loadedSections}
        onSelect={setActiveSection}
      />
      <section
        aria-labelledby={`admin-${activeSection}-title`}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="mb-3 flex shrink-0 items-baseline gap-3">
          <h2
            id={`admin-${activeSection}-title`}
            className="shrink-0 text-lg font-black lg:text-xl"
          >
            {d.adminDashboard.sections[activeSection].label}
          </h2>
          <p className="hidden min-w-0 flex-1 truncate text-sm text-muted sm:block">
            {d.adminDashboard.sections[activeSection].description}
          </p>
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
              <div key={section} className="flex min-h-0 flex-1 flex-col gap-3">
                {state?.slow ? (
                  <Panel className="shrink-0 border border-gold/20 bg-gold/5 py-4">
                    <p className="font-bold">{d.adminDashboard.slowTitle}</p>
                    <p className="mt-1 text-sm text-muted">{d.adminDashboard.slowBody}</p>
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
            <div key={section} className="flex min-h-0 flex-1 flex-col gap-3">
              {state.error ? (
                <Alert tone="error" className="flex shrink-0 items-center justify-between gap-3">
                  <span>{translateError(d, state.error)}</span>
                  <Button size="sm" onClick={() => void load(section, true)}>
                    {d.common.retry}
                  </Button>
                </Alert>
              ) : state.loading ? (
                <p role="status" className="shrink-0 px-1 text-sm text-muted">
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
