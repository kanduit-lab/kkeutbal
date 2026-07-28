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

function loginErrorCopy(d: Dictionary): Record<string, string> {
  return {
    invalid_credentials: d.auth.errorInvalidCredentials,
    guest_token_invalid: d.auth.errorGuestTokenInvalid,
    too_many_attempts: d.auth.errorTooManyAttempts,
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