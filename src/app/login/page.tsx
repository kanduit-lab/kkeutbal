import Link from 'next/link'
import { redirect } from 'next/navigation'
import { hasAuthentik, hasDevLogin, signIn } from '@/lib/auth'
import { loginWithGuestToken, loginWithPassword } from '@/features/auth/actions'
import { findCard } from '@/features/hwatu/cards'
import { HwatuCardView } from '@/components/hwatu-card'
import { Button, Input, Panel } from '@/components/ui'

const SHOWCASE_CARD_IDS = ['03-gwang', '08-gwang', '01-gwang'] as const

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>
}) {
  const { next, error } = await searchParams
  const redirectTo = next && next.startsWith('/') ? next : '/'
  const authentik = hasAuthentik()
  const devLogin = hasDevLogin()
  const showcase = SHOWCASE_CARD_IDS.map((id) => findCard(id)).filter(
    (card): card is NonNullable<typeof card> => card !== undefined,
  )

  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-6xl items-center gap-10 px-6 py-10 lg:grid-cols-2 lg:gap-16">
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
          끗발<span className="text-accent">.</span>
        </h1>
        <p className="mt-4 text-lg text-muted">섯다 · 고스톱 · 포커 판 기록</p>
        <p className="mt-2">
          <Link href="/about" className="text-sm text-muted underline underline-offset-4 hover:text-text">
            이 앱 소개
          </Link>
        </p>
      </section>

      <section className="rise-in rise-in-2 w-full max-w-sm justify-self-center lg:justify-self-start">
        <div className="space-y-4">
          {error ? (
            <p className="rounded-xl border border-accent/30 bg-[#471a17] px-4 py-3 text-sm font-medium text-[#ff9a94]">
              {error}
            </p>
          ) : null}

          <Panel className="space-y-4">
            <p className="font-bold">아이디 로그인</p>
            <form className="space-y-3" action={loginWithPassword}>
              <input type="hidden" name="next" value={redirectTo} />
              <Input name="username" placeholder="아이디" maxLength={20} required autoComplete="username" />
              <Input
                name="password"
                type="password"
                placeholder="비밀번호"
                maxLength={72}
                required
                autoComplete="current-password"
              />
              <Button type="submit" variant="primary" size="lg" className="w-full">
                로그인
              </Button>
            </form>
            <p className="text-center text-sm text-muted">
              계정이 없다면{' '}
              <Link href="/register" className="font-bold text-text underline underline-offset-4">
                회원가입
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
                Authentik 으로 로그인
              </Button>
            </form>
          ) : null}

          <details className="group">
            <summary className="cursor-pointer list-none rounded-xl border border-white/10 px-4 py-3 text-center text-sm font-medium text-muted transition-colors hover:text-text">
              게스트 토큰으로 입장
            </summary>
            <Panel className="mt-2 space-y-3">
              <p className="text-xs text-muted">
                관리자에게 받은 토큰과 이름을 입력하세요. 같은 토큰·이름이면 같은 계정입니다
              </p>
              <form className="space-y-3" action={loginWithGuestToken}>
                <input type="hidden" name="next" value={redirectTo} />
                <Input
                  name="code"
                  placeholder="토큰 8자리"
                  maxLength={8}
                  required
                  autoComplete="off"
                  autoCapitalize="characters"
                  className="uppercase tracking-[0.3em]"
                />
                <Input name="name" placeholder="이름" maxLength={20} required autoComplete="off" />
                <Button type="submit" variant="primary" size="lg" className="w-full">
                  게스트 입장
                </Button>
              </form>
            </Panel>
          </details>

          {devLogin ? (
            <Panel className="space-y-4">
              <div>
                <p className="font-bold">개발용 게스트 로그인</p>
                <p className="mt-0.5 text-xs text-muted">같은 이름으로 로그인하면 같은 계정입니다</p>
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
                <Input name="name" placeholder="이름" maxLength={20} required autoComplete="off" />
                <Button type="submit" variant="surface" size="lg" className="w-full border border-white/10">
                  게스트 로그인
                </Button>
              </form>
            </Panel>
          ) : null}
        </div>
      </section>
    </main>
  )
}
