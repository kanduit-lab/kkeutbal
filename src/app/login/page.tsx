import { redirect } from 'next/navigation'
import { hasAuthentik, hasDevLogin, signIn } from '@/lib/auth'
import { findCard } from '@/features/hwatu/cards'
import { HwatuCardView } from '@/components/hwatu-card'
import { Button, Input, Panel } from '@/components/ui'

const SHOWCASE_CARD_IDS = ['03-gwang', '08-gwang', '01-gwang'] as const

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
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
              className="rise-in"
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
        <p className="mt-4 text-lg text-muted">
          오늘 누가 제일 땄는지,
          <br />
          끝나면 여기 다 나옵니다.
        </p>
      </section>

      <section className="rise-in rise-in-2 w-full max-w-sm justify-self-center lg:justify-self-start">
        <div className="space-y-4">
          {authentik ? (
            <form
              action={async () => {
                'use server'
                await signIn('authentik', { redirectTo })
              }}
            >
              <Button type="submit" variant="primary" size="lg" className="w-full">
                Authentik 으로 로그인
              </Button>
            </form>
          ) : null}

          {devLogin ? (
            <Panel className="space-y-4">
              <div>
                <p className="font-bold">이름만 대면 입장</p>
                <p className="mt-0.5 text-xs text-muted">같은 이름으로 오면 전적이 이어져요</p>
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
                <Input
                  name="name"
                  placeholder="이름 (예: 영창)"
                  maxLength={20}
                  required
                  autoComplete="off"
                />
                <Button type="submit" variant="primary" size="lg" className="w-full">
                  판에 앉기
                </Button>
              </form>
            </Panel>
          ) : null}

          {!authentik && !devLogin ? (
            <Panel>
              <p className="text-center text-sm text-muted">
                로그인 방법이 설정되지 않았어요. 서버 환경변수를 확인해 주세요.
              </p>
            </Panel>
          ) : null}
        </div>
      </section>
    </main>
  )
}
