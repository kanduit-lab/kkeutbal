import Link from 'next/link'
import { hasAuthentik, signIn } from '@/lib/auth'
import { LoginFormSwitcher } from '@/features/auth/components/login-form-switcher'
import { isFirstAccount } from '@/features/auth/bootstrap'
import { prepareInitialAdminSetup } from '@/features/auth/initial-admin-setup'
import { findCard } from '@/features/hwatu/cards'
import { HwatuCardView } from '@/components/hwatu-card'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { Alert, Button } from '@/components/ui'
import { format, getDict, type Dictionary } from '@/lib/i18n/server'

const SHOWCASE_CARD_IDS = ['03-gwang', '08-gwang', '01-gwang'] as const

/**
 * ?error= 코드 → 문구 화이트리스트. AuthJS 가 넣는 코드(OAuthCallbackError,
 * Configuration 등)나 임의 주입 텍스트는 매핑 실패로 일반 문구로 떨어진다 —
 * 쿼리 원문은 절대 그대로 렌더하지 않는다.
 */
function loginErrorCopy(d: Dictionary): Record<string, string> {
  return {
    invalid_credentials: d.auth.errorInvalidCredentials,
    guest_token_invalid: d.auth.errorGuestTokenInvalid,
    registration_code_required: d.auth.registrationCodeRequired,
    initial_admin_setup_required: d.auth.initialAdminSetupRequired,
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; mode?: string }>
}) {
  const [{ next, error, mode }, { d }, authentik, firstAccount] = await Promise.all([
    searchParams,
    getDict(),
    hasAuthentik(),
    isFirstAccount(),
  ])
  const errorMessage = error ? (loginErrorCopy(d)[error] ?? d.auth.errorLoginFailed) : null
  const redirectTo = next && next.startsWith('/') ? next : '/'
  const initialMode =
    mode === 'guest' ? 'guest' : mode === 'registration' ? 'registration' : 'password'
  // 방 링크로 튕겨 온 사용자에게 "로그인하면 어디로 가는지"를 알려 준다 — 없으면
  // 로그인 화면이 잘못된 링크처럼 보인다.
  const roomCode = /^\/rooms\/([A-Za-z0-9]{4,8})(?:[/?#]|$)/.exec(redirectTo)?.[1] ?? null
  const initialAdminSetupReady = firstAccount ? await prepareInitialAdminSetup() : false
  const showcase = SHOWCASE_CARD_IDS.map((id) => findCard(id)).filter(
    (card): card is NonNullable<typeof card> => card !== undefined,
  )

  return (
    <main
      id="main"
      className="relative mx-auto grid min-h-dvh w-full max-w-6xl items-center gap-10 px-6 py-10 lg:grid-cols-2 lg:gap-16"
    >
      {/* 모바일에서는 흐름 안에 둔다 — 절대 배치하면 바로 아래 화투 카드 위에 겹쳐 얹힌다. */}
      <div className="flex justify-end lg:absolute lg:right-4 lg:top-4 lg:z-10">
        <LocaleSwitcher />
      </div>
      <section className="rise-in text-center lg:text-left">
        <div className="mb-6 flex justify-center gap-3 lg:justify-start">
          {showcase.map((card, index) => (
            <div
              key={card.id}
              className="rise-in w-24 lg:w-28"
              style={{
                transform: `rotate(${(index - 1) * 8}deg) translateY(${index === 1 ? -6 : 0}px)`,
              }}
            >
              <HwatuCardView card={card} size="md" />
            </div>
          ))}
        </div>
        <h1 className="font-brush text-7xl font-black tracking-tight lg:text-8xl">
          {d.common.appName}
          <span className="text-accent">.</span>
        </h1>
        <p className="mt-4 text-lg text-muted">{d.auth.tagline}</p>
        <p className="mt-2">
          {/* 로그인 화면의 유일한 탈출구다. 줄 높이(16px)만 한 타깃이라 한 손으로 누르면
              빗나간다 — 다른 단독 링크들과 같은 min-h-11 + 좌우 여백으로 맞춘다. */}
          <Link
            href="/about"
            className="inline-flex min-h-11 items-center px-2 text-sm text-muted underline underline-offset-4 hover:text-text"
          >
            {d.auth.aboutLink}
          </Link>
        </p>
      </section>

      <section className="rise-in rise-in-2 w-full max-w-sm justify-self-center lg:justify-self-start">
        <div className="space-y-4">
          {errorMessage ? <Alert tone="error">{errorMessage}</Alert> : null}

          {roomCode ? (
            <Alert tone="info">{format(d.auth.continueToRoom, { code: roomCode })}</Alert>
          ) : null}

          <LoginFormSwitcher
            redirectTo={redirectTo}
            initialMode={initialMode}
            firstAccount={firstAccount}
            initialAdminSetupReady={initialAdminSetupReady}
          />

          {authentik ? (
            <form
              action={async () => {
                'use server'
                await signIn('authentik', { redirectTo })
              }}
            >
              <Button
                type="submit"
                variant="surface"
                size="lg"
                className="w-full border border-white/10"
              >
                {d.auth.authentikButton}
              </Button>
            </form>
          ) : null}
        </div>
      </section>
    </main>
  )
}
