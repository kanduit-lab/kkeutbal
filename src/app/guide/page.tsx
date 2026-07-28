import Link from 'next/link'
import type { Metadata, Route } from 'next'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { PageHeader, PageShell, Panel } from '@/components/ui'
import { GAME_LABELS } from '@/features/game/labels'
import { getDict, type Dictionary } from '@/lib/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDict()
  return { title: `${d.guide.indexTitle} · ${d.common.appName}` }
}

interface GuideEntry {
  readonly href: Route
  readonly emoji: string
  readonly title: string
  readonly description: string
}

function guideEntries(d: Dictionary): readonly GuideEntry[] {
  return [
    {
      href: '/guide/seotda',
      emoji: GAME_LABELS.seotda.emoji,
      title: d.games.seotda,
      description: '두 장으로 족보를 겨루는 게임. 족보 서열과 광땡·특수패 정리',
    },
    {
      href: '/guide/gostop',
      emoji: GAME_LABELS.gostop.emoji,
      title: d.games.gostop,
      description: '광·열끗·띠·피 모아 점수 내기. 고/스톱과 배수 규칙 정리',
    },
    {
      href: '/guide/poker',
      emoji: GAME_LABELS.poker.emoji,
      title: d.games.poker,
      description: '텍사스 홀덤 족보 10가지 서열표와 예시 카드',
    },
    {
      href: '/guide/usage',
      emoji: '📱',
      title: d.guide.usageTitle,
      description: '방 만들기부터 베팅, 정산, 랭킹까지 — 딜러 전용 기능 포함',
    },
  ]
}

const RISE_DELAY = ['rise-in-1', 'rise-in-2', 'rise-in-3', 'rise-in-4'] as const

export default async function GuidePage() {
  const { d } = await getDict()

  return (
    <PageShell width="wide">
      <PageHeader
        className="rise-in"
        title={
          <>
            {d.guide.indexTitle}
            <span className="text-accent">.</span>
          </>
        }
        subtitle={d.guide.indexSubtitle}
        backHref="/"
        backLabel={d.common.home}
        actions={<LocaleSwitcher />}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {guideEntries(d).map((entry, index) => (
          <Link
            key={entry.href}
            href={entry.href}
            className={`rise-in ${RISE_DELAY[Math.min(index, RISE_DELAY.length - 1)]} block`}
          >
            <Panel className="flex h-full flex-col items-center gap-2 py-8 text-center transition-transform hover:-translate-y-0.5">
              <p aria-hidden className="text-3xl">
                {entry.emoji}
              </p>
              <p className="font-brush text-xl font-bold">{entry.title}</p>
              <p className="text-sm text-muted">{entry.description}</p>
            </Panel>
          </Link>
        ))}
      </div>
    </PageShell>
  )
}