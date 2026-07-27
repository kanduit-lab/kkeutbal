'use client'

import type {
  AdminRoomView,
  AdminUserView,
  GuestTokenView,
  RegistrationCodeView,
} from '../admin-queries'
import type { SsoSettingsView } from '../sso-settings'
import type { VisionSettingsView } from '@/features/jokbo-advisor/vision/settings'
import { AccessPanel } from './admin/access-panel'
import { MembersPanel } from './admin/members-panel'
import { RoomsPanel } from './admin/rooms-panel'
import { SsoSettingsPanel } from './admin/sso-settings-panel'
import { VisionSettingsPanel } from './admin/vision-settings-panel'

/**
 * 관리자 콘솔 섹션 라우터. 네 개의 관리 도메인이 한 파일 안에서 18개 state 를 공유하고
 * 두 쌍의 패널이 통째로 복붙돼 있던 구조를 도메인별 패널로 갈랐다.
 *
 * props 는 판별 유니온이다 — 예전엔 전부 optional 이라 `section="settings"` 에
 * tokens 만 넘겨도 타입이 통과하고 화면은 조용히 비어 있었다.
 */
export type AdminClientProps =
  | {
      section: 'settings'
      ssoSettings: SsoSettingsView
      visionSettings: VisionSettingsView
      onDataChanged: () => void
    }
  | {
      section: 'access'
      tokens: readonly GuestTokenView[]
      registrationCodes: readonly RegistrationCodeView[]
      onDataChanged: () => void
    }
  | {
      section: 'people'
      users: readonly AdminUserView[]
      selfId: string
      onDataChanged: () => void
    }
  | {
      section: 'operations'
      rooms: readonly AdminRoomView[]
      onDataChanged: () => void
    }

export function AdminClient(props: AdminClientProps) {
  if (props.section === 'settings') {
    return (
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <SsoSettingsPanel settings={props.ssoSettings} onDataChanged={props.onDataChanged} />
        <VisionSettingsPanel settings={props.visionSettings} onDataChanged={props.onDataChanged} />
      </div>
    )
  }

  if (props.section === 'access') {
    return (
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <AccessPanel
          tokens={props.tokens}
          registrationCodes={props.registrationCodes}
          onDataChanged={props.onDataChanged}
        />
      </div>
    )
  }

  if (props.section === 'people') {
    return (
      <div className="space-y-4">
        <MembersPanel
          users={props.users}
          selfId={props.selfId}
          onDataChanged={props.onDataChanged}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <RoomsPanel rooms={props.rooms} onDataChanged={props.onDataChanged} />
    </div>
  )
}
