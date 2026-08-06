'use server'

import { z } from 'zod'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { currentUserId } from './session'
import { isAdminUser } from './roles'
import {
  countActiveRooms,
  listActiveRooms,
  listGuestTokens,
  listRegistrationCodes,
  listUsers,
} from './admin-queries'
import { getSsoSettings } from './sso-settings'
import { migrateLegacyGuestTokenSecrets } from './guest-tokens'
import { ADMIN_SECTIONS, type AdminSection, type AdminSectionData } from './admin-dashboard-types'
import { getVisionSettings } from '@/features/jokbo-advisor/vision/settings'
import { listPromotions } from '@/features/promotions/queries'

const sectionSchema = z.enum(ADMIN_SECTIONS)

export async function loadAdminSection(input: {
  section: AdminSection
}): Promise<ActionResult<AdminSectionData>> {
  const parsed = sectionSchema.safeParse(input.section)
  if (!parsed.success) return fail('errors.invalidInput')

  const userId = await currentUserId()
  if (!userId || !(await isAdminUser(userId))) return fail('errors.adminOnlyChange')

  try {
    switch (parsed.data) {
      case 'settings': {
        const [ssoSettings, visionSettings] = await Promise.all([
          getSsoSettings(),
          getVisionSettings(),
        ])
        return ok({ section: 'settings', ssoSettings, visionSettings })
      }
      case 'access': {
        await migrateLegacyGuestTokenSecrets()
        const [tokens, registrationCodes] = await Promise.all([
          listGuestTokens(),
          listRegistrationCodes(),
        ])
        return ok({ section: 'access', tokens, registrationCodes })
      }
      case 'people': {
        return ok({ section: 'people', users: await listUsers() })
      }
      case 'operations': {
        const [rooms, roomTotal, promotions] = await Promise.all([
          listActiveRooms(),
          countActiveRooms(),
          listPromotions(),
        ])
        return ok({ section: 'operations', rooms, roomTotal, promotions })
      }
    }
  } catch (error) {
    console.error(`loadAdminSection(${parsed.data}) failed:`, error)
    return fail('errors.adminDashboardLoadFailed')
  }
}
