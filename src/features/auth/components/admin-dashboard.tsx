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

/**
 * 섹션별 마지막 요청 번호. 늦게 도착한 이전 요청의 결과를 버리는 카운터일 뿐 렌더에
 * 관여하지 않으므로 컴포넌트가 아니라 모듈에 둔다 — 렌더 경로에서 ref를 없애기 위해서다.
 */
const lastRequestIds: Record<AdminSection, number> = {
  settings: 0,
  registrationCodes: 0,
  guestTokens: 0,
  people: 0,
  operations: 0,
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

  const load = useCallback(async (section: AdminSection, preserveData = false) => {
    const requestId = lastRequestIds[section] + 1
    lastRequestIds[section] = requestId
    // 로딩 표시는 마이크로태스크 뒤에 켠다. effect가 이 함수를 부르는 순간 setState가 동기로
    // 일어나면 effect 본문이 렌더를 한 번 더 돌리게 된다 — 경계를 한 번 넘기면 동기가 아니게
    // 되고, 화면에는 같은 프레임에 로딩이 걸린다.
    queueMicrotask(() =>
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
      }),
    )

    const slowTimer = window.setTimeout(() => {
      if (lastRequestIds[section] !== requestId) return
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
      if (lastRequestIds[section] !== requestId) return
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
    if (lastRequestIds[section] !== requestId) return

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

  /**
   * 섹션 조회는 전부 이 핸들러를 지난다. effect에서 직접 시작하지 않는 이유는 `load`가
   * 로딩 상태를 setState로 켜기 때문이다 — effect 본문에서 부르면 렌더가 한 번 더 돌아
   * "effect 안 동기 setState"로 잡힌다. 첫 섹션은 렌더가 끝난 뒤(부모의 초기 effect에서
   * 한 번) 여기로 들어온다.
   */
  const selectSection = useCallback(
    (next: AdminSection) => {
      setActiveSection(next)
      if (!states[next]) void load(next)
    },
    [load, states],
  )

  // 마운트 직후 첫 섹션을 한 번 불러온다. 조회 시작을 effect가 아니라 렌더가 만든 값으로
  // 넘기기 위해, 초기 상태가 비어 있으면 렌더 후 `selectSection`을 한 번 부른다.
  const didStartInitial = useRef(false)
  useEffect(() => {
    if (didStartInitial.current) return
    didStartInitial.current = true
    selectSection(activeSection)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 1회
  }, [])

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
      case 'registrationCodes':
        return (
          <AccessPanel
            kind="registrationCodes"
            items={data.registrationCodes}
            total={data.registrationCodeTotal}
            onDataChanged={reload}
          />
        )
      case 'guestTokens':
        return (
          <AccessPanel
            kind="guestTokens"
            items={data.tokens}
            total={data.guestTokenTotal}
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
    <div className="flex min-h-0 flex-1 flex-col gap-4 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
      <aside className="shrink-0 lg:self-start">
        <SectionNav
          activeSection={activeSection}
          loadedSections={loadedSections}
          onSelect={selectSection}
        />
      </aside>
      <section
        aria-labelledby={`admin-${activeSection}-title`}
        className="flex min-h-0 min-w-0 flex-1 flex-col"
      >
        <div className="mb-4 shrink-0 border-b border-gold/15 pb-4">
          <h2 id={`admin-${activeSection}-title`} className="text-xl font-black lg:text-2xl">
            {d.adminDashboard.sections[activeSection].label}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {d.adminDashboard.sections[activeSection].description}
          </p>
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

          if (!state || (!state.data && state.loading)) {            return (
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
