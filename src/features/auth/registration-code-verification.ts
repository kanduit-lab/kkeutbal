import { headers } from 'next/headers'
import { clientAddressFromHeaders, consumeRateLimits } from '@/lib/rate-limit'
import { isFirstAccount } from '@/features/auth/bootstrap'
import {
  grantInitialAdminSetupAccess,
  prepareInitialAdminSetup,
} from '@/features/auth/initial-admin-setup'
import { grantRegistrationAccess } from '@/features/auth/registration-access'

/**
 * 가입 코드·최초 관리자 설정 코드 검증 — `actions.ts`의
 * `verifyRegistrationCode`/`verifyInitialAdminSetupCode` 구현.
 * 둘 다 "짧은 코드를 rate limit 안에서 확인하고 접근 쿠키를 발급한다"는 같은 모양이라
 * 한 파일에 묶는다.
 */

export async function verifyInitialAdminSetupAccess(formData: FormData) {
  if (!(await isFirstAccount())) return { status: 'error' as const, error: 'unavailable' as const }

  if (!(await prepareInitialAdminSetup())) {
    return { status: 'error' as const, error: 'unavailable' as const }
  }

  const code = String(formData.get('code') ?? '')
  const address = clientAddressFromHeaders(new Headers(await headers()))
  const rate = await consumeRateLimits([
    {
      scope: 'auth.initial_admin_setup.address',
      identifier: address,
      limit: 10,
      windowMs: 15 * 60 * 1000,
    },
    {
      scope: 'auth.initial_admin_setup.value_address',
      identifier: `${code}\0${address}`,
      limit: 5,
      windowMs: 15 * 60 * 1000,
    },
  ])
  if (!rate.allowed) return { status: 'error' as const, error: 'invalid' as const }

  return (await grantInitialAdminSetupAccess(code))
    ? { status: 'success' as const }
    : { status: 'error' as const, error: 'invalid' as const }
}

export async function verifyRegistrationCodeAccess(formData: FormData) {
  const code = String(formData.get('code') ?? '')
  const address = clientAddressFromHeaders(new Headers(await headers()))
  try {
    const rate = await consumeRateLimits([
      {
        scope: 'auth.registration_code.address',
        identifier: address,
        limit: 15,
        windowMs: 15 * 60 * 1000,
      },
      {
        scope: 'auth.registration_code.value_address',
        identifier: `${code}\0${address}`,
        limit: 5,
        windowMs: 15 * 60 * 1000,
      },
    ])
    if (!rate.allowed) return { status: 'error' as const, error: 'invalid' as const }
  } catch (error) {
    console.error('registration code rate limit check failed:', error)
    return { status: 'error' as const, error: 'unavailable' as const }
  }

  const result = await grantRegistrationAccess(code)
  if (result === 'granted') return { status: 'success' as const }
  return { status: 'error' as const, error: result }
}
