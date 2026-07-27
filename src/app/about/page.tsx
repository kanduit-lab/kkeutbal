import Link from 'next/link'
import { findCard } from '@/features/hwatu/cards'
import { HwatuCardView } from '@/components/hwatu-card'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { ButtonLink, PageShell, Panel } from '@/components/ui'
import type { Metadata } from 'next'
import { getDict } from '@/lib/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDict()
  return { title: `${d.home.aboutLink} · ${d.common.appName}` }
}

const SHOWCASE_CARD_IDS = ['01-gwang', '03-gwang', '08-gwang', '11-gwang', '12-gwang'] as const

/** 앱 소개 — 로그인 없이 볼 수 있는 정적 페이지. */
export default async function AboutPage() {
  const { d } = await getDict()
  const showcase = SHOWCASE_CARD_IDS.map((id) => findCard(id)).filter(
    (card): card is NonNullable<typeof card> => card !== undefined,
  )

  const features = [
    { emoji: '🪑', title: d.about.featureRealtimeTitle, body: d.about.featureRealtimeBody },
    { emoji: '🧾', title: d.about.featureSettleTitle, body: d.about.featureSettleBody },
    { emoji: '🏆', title: d.about.featureRankingTitle, body: d.about.featureRankingBody },
    { emoji: '🔮', title: d.about.featureAdvisorTitle, body: d.about.featureAdvisorBody },
  ] as const

  const steps = [d.about.step1, d.about.step2, d.about.step3, d.about.step4, d.about.step5] as const

  return (
    <PageShell width="content" className="relative">
      <div className="absolute right-4 top-4 z-10">
        <LocaleSwitcher />
      </div>
      <header className="rise-in text-center">
        <div className="mb-6 flex justify-center gap-2">
          {showcase.map((card, index) => (
            <div
              key={card.id}
              className="w-16 sm:w-20"
              style={{ transform: `rotate(${(index - 2) * 6}deg)` }}
            >
              <HwatuCardView card={card} size="sm" />
            </div>
          ))}
        </div>
        <h1 className="font-brush text-6xl font-black tracking-tight">
          {d.common.appName}<span className="text-accent">.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted">{d.about.tagline}</p>
      </header>

      <section className="rise-in rise-in-1 mt-10 grid gap-4 sm:grid-cols-2">
        {features.map((feature) => (
          <Panel key={feature.title} className="space-y-2">
            <p aria-hidden className="text-3xl">
              {feature.emoji}
            </p>
            <h2 className="font-bold">{feature.title}</h2>
            <p className="text-sm text-muted">{feature.body}</p>
          </Panel>
        ))}
      </section>

      <section className="rise-in rise-in-2 mt-8 space-y-3">
        <h2 className="text-xl font-bold">{d.about.howTitle}</h2>
        <Panel>
          <ol className="list-inside list-decimal space-y-2 text-sm">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </Panel>
        <p className="text-xs text-muted">{d.about.disclaimer}</p>
      </section>

      <div className="rise-in rise-in-3 mt-10 grid gap-3 sm:grid-cols-2">
        <ButtonLink href="/login" variant="primary" size="lg">
          {d.about.start}
        </ButtonLink>
        <ButtonLink href="/guide" variant="surface" size="lg" className="border border-white/10">
          {d.about.guideLink}
        </ButtonLink>
      </div>

      <footer className="mt-10 text-center text-xs text-muted">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-text"
        >
          {d.common.home}
        </Link>
      </footer>
    </PageShell>
  )
}
