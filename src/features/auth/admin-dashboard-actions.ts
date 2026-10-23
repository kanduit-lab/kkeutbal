'use server'

import { z } from 'zod'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { currentUserId } from './session'
import { isAdminUser } from './roles'
import {
  countUsers,
  listActiveRoomsPage,
  listGuestTokensPage,
  listRegistrationCodesPage,
  listUsers,
} from './admin-queries'
import { getSsoSettings } from './sso-settings'
import { migrateLegacyGuestTokenSecrets } from './guest-tokens'
import { ADMIN_SECTIONS, type AdminSection, type AdminSectionData } from './admin-dashboard-types'
import { getVisionSettings } from '@/features/jokbo-advisor/vision/settings'
import { listPromotions } from '@/features/promotions/queries'

const sectionSchema = z.enum(ADMIN_SECTIONS)
const roomPageSchema = z.object({
  text: z.string().trim().max(30),
  status: z.enum(['all', 'waiting', 'playing']),
  page: z.number().int().min(0).max(10_000),
  pageSize: z.number().int().min(1).max(50),
})
const accessPageSchema = z.object({
  kind: z.enum(['registrationCodes', 'guestTokens']),
  page: z.number().int().min(0).max(10_000),
  pageSize: z.number().int().min(1).max(50),
})

export async function loadAdminAccessPage(input: z.input<typeof accessPageSchema>) {
  const parsed = accessPageSchema.safeParse(input)
  if (!parsed.success) return fail('errors.invalidInput')

  const userId = await currentUserId()
  if (!userId || !(await isAdminUser(userId))) return fail('errors.adminOnlyChange')

  try {
    if (parsed.data.kind === 'registrationCodes') {
      return ok(await listRegistrationCodesPage(parsed.data))
    }
    await migrateLegacyGuestTokenSecrets()
    return ok(await listGuestTokensPage(parsed.data))
  } catch (error) {
    console.error(`loadAdminAccessPage(${parsed.data.kind}) failed:`, error)
    return fail('errors.adminDashboardLoadFailed')
  }
}

export async function loadAdminRoomsPage(input: z.input<typeof roomPageSchema>) {
  const parsed = roomPageSchema.safeParse(input)
  if (!parsed.success) return fail('errors.invalidInput')

  const userId = await currentUserId()
  if (!userId || !(await isAdminUser(userId))) return fail('errors.adminOnlyChange')

  try {
    return ok(await listActiveRoomsPage(parsed.data))
  } catch (error) {
    console.error('loadAdminRoomsPage failed:', error)
    return fail('errors.adminDashboardLoadFailed')
  }
}

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
      case 'registrationCodes': {
        const registrationCodes = await listRegistrationCodesPage({ page: 0, pageSize: 5 })
        return ok({
          section: 'registrationCodes',
          registrationCodes: registrationCodes.items,
          registrationCodeTotal: registrationCodes.total,
        })
      }
      case 'guestTokens': {
        await migrateLegacyGuestTokenSecrets()
        const tokens = await listGuestTokensPage({ page: 0, pageSize: 5 })
        return ok({ section: 'guestTokens', tokens: tokens.items, guestTokenTotal: tokens.total })
      }
      case 'people': {
        const [users, userTotal] = await Promise.all([listUsers(), countUsers()])
        return ok({ section: 'people', users, userTotal })
      }
      case 'operations': {
        const [roomPage, promotions] = await Promise.all([
          listActiveRoomsPage({ text: '', status: 'all', page: 0, pageSize: 6 }),
          listPromotions(),
        ])
        return ok({
          section: 'operations',
          rooms: roomPage.rooms,
          roomTotal: roomPage.total,
          promotions,
        })
      }
    }
  } catch (error) {
    console.error(`loadAdminSection(${parsed.data}) failed:`, error)
    return fail('errors.adminDashboardLoadFailed')
  }
}
