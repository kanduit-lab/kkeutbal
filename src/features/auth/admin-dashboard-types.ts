import type {
  AdminRoomView,
  AdminUserView,
  GuestTokenView,
  RegistrationCodeView,
} from './admin-queries'
import type { SsoSettingsView } from './sso-settings'
import type { VisionSettingsView } from '@/features/jokbo-advisor/vision/settings'
import type { AdminPromotionView } from '@/features/promotions/types'

export const ADMIN_SECTIONS = ['settings', 'access', 'people', 'operations'] as const
export type AdminSection = (typeof ADMIN_SECTIONS)[number]

export type AdminSectionData =
  | {
      readonly section: 'settings'
      readonly ssoSettings: SsoSettingsView
      readonly visionSettings: VisionSettingsView
    }
  | {
      readonly section: 'access'
      readonly tokens: readonly GuestTokenView[]
      readonly registrationCodes: readonly RegistrationCodeView[]
    }
  | {
      readonly section: 'people'
      readonly users: readonly AdminUserView[]
    }
  | {
      readonly section: 'operations'
      readonly rooms: readonly AdminRoomView[]

      /** 진행 중인 방의 실제 전체 수. `rooms`는 100개에서 잘리므로 이 값이 더 클 수 있다. */
      readonly roomTotal: number
      readonly promotions: readonly AdminPromotionView[]
    }
