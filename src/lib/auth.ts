import NextAuth from 'next-auth'
import { authConfigBase } from './auth-config'
import { buildProviders } from './auth-providers'
import { getActiveSsoSettings } from '@/features/auth/sso-settings'
import { mergeHints, resolveProviderUser } from '@/features/auth/provider-account-resolution'
import { linkAuthentikSubToAccount } from '@/features/auth/sso-link-resolution'
import { consumeSsoLinkIntent, setSsoLinkResult } from '@/features/auth/sso-link-cookies'

export { RATE_LIMITED_CODE } from './auth-providers'

export async function hasAuthentik(): Promise<boolean> {
  return Boolean(await getActiveSsoSettings())
}

export const { handlers, auth, signIn, signOut } = NextAuth(async () => {
  const sso = await getActiveSsoSettings()
  return {
    ...authConfigBase,
    providers: buildProviders(sso),
    callbacks: {
      ...authConfigBase.callbacks,
      async jwt({ token, user, account, profile }) {
        if (user && account) {
          try {
            if (account.provider === 'password') {
              token.uid = String(user.id)
              token.name = user.name
              return token
            }

            const isCredentialGuest = account.provider === 'guest-token'
            const sub = isCredentialGuest
              ? String(user.id)
              : (token.sub ?? `${account.provider}:${String(user.id)}`)
            const displayName = user.name?.trim() || '플레이어'

            if (account.provider === 'authentik') {
              // '/account'에서 시작한 연결 시도인지 확인한다. 쿠키 접근 자체가 실패해도
              // (예: 이 가정이 틀렸을 경우) 일반 로그인까지 깨지면 안 되므로 여기만 따로
              // try/catch로 감싸 실패 시 "연결 의도 없음"으로 취급하고 아래 일반 흐름으로
              // 폴백한다 — 최악의 경우 이 기능만 조용히 무력화되지, 모든 Authentik
              // 로그인이 깨지지는 않는다.
              let linkTargetUserId: string | null = null
              try {
                linkTargetUserId = await consumeSsoLinkIntent()
              } catch (intentError) {
                console.error(
                  'sso link intent read failed, falling back to normal sign-in:',
                  intentError,
                )
              }

              if (linkTargetUserId) {
                const { result, displayName: targetDisplayName } = await linkAuthentikSubToAccount(
                  { targetUserId: linkTargetUserId, sub },
                )
                await setSsoLinkResult(result)
                // 성공이든 거부든 세션은 연결을 시도한 원래 계정 그대로 유지한다 — 실패했다고
                // 로그아웃되거나 낯선 새 계정으로 바뀌면 안 된다.
                token.uid = linkTargetUserId
                token.name = targetDisplayName ?? displayName
                return token
              }
            }

            const row = await resolveProviderUser({
              sub,
              displayName,
              avatarUrl: user.image ?? null,
              hints:
                account.provider === 'authentik'
                  ? mergeHints(profile)
                  : { phone: null },
            })
            token.uid = row.id
            token.name = displayName
          } catch (error) {
            console.error('sign-in user resolution failed:', error)
            throw new Error('로그인 처리 중 오류가 발생했습니다')
          }
        }
        return token
      },
    },
  }
})
