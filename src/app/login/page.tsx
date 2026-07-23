import Link from 'next/link'
import { redirect } from 'next/navigation'
import { hasAuthentik, hasDevLogin, signIn } from '@/lib/auth'
import { loginWithGuestToken, loginWithPassword } from '@/features/auth/actions'
import { GuestNamePicker } from '@/features/auth/components/guest-name-picker'
import { findCard } from '@/features/hwatu/cards'
import { HwatuCardView } from '@/components/hwatu-card'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { Button, Input, Panel, SubmitButton } from '@/components/ui'
import { getDict, type Dictionary } from '@/lib/i18n/server'

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
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>
}) {
  const [{ next, error }, { d }] = await Promise.all([searchParams, getDict()])
  const errorMessage = error ? (loginErrorCopy(d)[error] ?? d.auth.errorLoginFailed) : null
  const redirectTo = next && next.startsWith('/') ? next : '/'
  const authentik = hasAuthentik()
  const devLogin = hasDevLogin()
  const showcase = SHOWCASE_CARD_IDS.map((id) => findCard(id)).filter(
    (card): card is NonNullable<typeof card> => card !== undefined,
  )

  return (
    <main className="relative mx-auto grid min-h-dvh w-full max-w-6xl items-center gap-10 px-6 py-10 lg:grid-cols-2 lg:gap-16">
      <div className="absolute right-4 top-4 z-10">
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
          {d.common.appName}<span className="text-accent">.</span>
        </h1>
        <p className="mt-4 text-lg text-muted">{d.auth.tagline}</p>
        <p className="mt-2">
          <Link href="/about" className="text-sm text-muted underline underline-offset-4 hover:text-text">
            {d.auth.aboutLink}
          </Link>
        </p>
      </section>

      <section className="rise-in rise-in-2 w-full max-w-sm justify-self-center lg:justify-self-start">
        <div className="space-y-4">
          {errorMessage ? (
            <p className="rounded-xl border border-accent/30 bg-[#471a17] px-4 py-3 text-sm font-medium text-[#ff9a94]">
              {errorMessage}
            </p>
          ) : null}

          <Panel className="space-y-4">
            <p className="font-bold">{d.auth.passwordLoginTitle}</p>
            <form className="space-y-3" action={loginWithPassword}>
              <input type="hidden" name="next" value={redirectTo} />
              <Input
                name="username"
                placeholder={d.auth.usernamePlaceholder}
                maxLength={20}
                required
                autoComplete="username"
              />
              <Input
                name="password"
                type="password"
                placeholder={d.auth.passwordPlaceholder}
                maxLength={72}
                required
                autoComplete="current-password"
              />
              <SubmitButton variant="primary" size="lg" className="w-full" pendingLabel={d.auth.loginPending}>
                {d.auth.login}
              </SubmitButton>
            </form>
            <p className="text-center text-sm text-muted">
              {d.auth.noAccount}{' '}
              <Link href="/register" className="font-bold text-text underline underline-offset-4">
                {d.auth.registerLink}
              </Link>
            </p>
          </Panel>

          {authentik ? (
            <form
              action={async () => {
                'use server'
                await signIn('authentik', { redirectTo })
              }}
            >
              <Button type="submit" variant="surface" size="lg" className="w-full border border-white/10">
                {d.auth.authentikButton}
              </Button>
            </form>
          ) : null}

          <details className="group">
            <summary className="cursor-pointer list-none rounded-xl border border-white/10 px-4 py-3 text-center text-sm font-medium text-muted transition-colors hover:text-text">
              {d.auth.guestTokenSummary}
            </summary>
            <Panel className="mt-2 space-y-3">
              <p className="text-xs text-muted">{d.auth.guestTokenHint}</p>
              <form className="space-y-3" action={loginWithGuestToken}>
                <input type="hidden" name="next" value={redirectTo} />
                <GuestNamePicker />
              </form>
            </Panel>
          </details>

          {devLogin ? (
            <Panel className="space-y-4">
              <div>
                <p className="font-bold">{d.auth.devGuestTitle}</p>
                <p className="mt-0.5 text-xs text-muted">{d.auth.devGuestHint}</p>
              </div>
              <form
                className="space-y-3"
                action={async (formData: FormData) => {
                  'use server'
                  const name = String(formData.get('name') ?? '').trim()
                  if (!name) redirect('/login')
                  await signIn('dev-login', { name, redirectTo })
                }}
              >
                <Input name="name" placeholder={d.auth.namePlaceholder} maxLength={20} required autoComplete="off" />
                <Button type="submit" variant="surface" size="lg" className="w-full border border-white/10">
                  {d.auth.devGuestButton}
                </Button>
              </form>
            </Panel>
          ) : null}
        </div>
      </section>
    </main>
  )
}
